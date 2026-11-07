"""STTN generator, trimmed to what inference needs.

Adapted from https://github.com/researchmm/STTN (MIT License) by way of
https://github.com/YaoFANGUK/video-subtitle-remover (Apache-2.0), whose weights
this layout loads. Module names must stay as they are to match those weights.

MIT License

Copyright (c) 2020 researchmm

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""

from __future__ import annotations

import math

import torch
import torch.nn as nn
import torch.nn.functional as F

# Attention patches are sized for the 160x30 feature map of a 640x120 input.
PATCH_SIZES = [(80, 15), (32, 6), (10, 5), (5, 3)]
CHANNELS = 256
STACK_DEPTH = 8


class Deconv(nn.Module):
    def __init__(self, in_channels: int, out_channels: int) -> None:
        super().__init__()
        self.conv = nn.Conv2d(in_channels, out_channels, kernel_size=3, stride=1, padding=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.conv(F.interpolate(x, scale_factor=2, mode="bilinear", align_corners=True))


def _tokens(tensor: torch.Tensor, shape: tuple[int, ...]) -> torch.Tensor:
    t, d_k, out_h, height, out_w, width = shape
    return tensor.view(*shape).permute(0, 2, 4, 1, 3, 5).contiguous().view(1, t * out_h * out_w, d_k * height * width)


class MultiHeadedAttention(nn.Module):
    def __init__(self, d_model: int) -> None:
        super().__init__()
        self.query_embedding = nn.Conv2d(d_model, d_model, kernel_size=1, padding=0)
        self.value_embedding = nn.Conv2d(d_model, d_model, kernel_size=1, padding=0)
        self.key_embedding = nn.Conv2d(d_model, d_model, kernel_size=1, padding=0)
        self.output_linear = nn.Sequential(nn.Conv2d(d_model, d_model, kernel_size=3, padding=1), nn.LeakyReLU(0.2, inplace=True))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        t, c, h, w = x.size()
        d_k = c // len(PATCH_SIZES)
        queries = torch.chunk(self.query_embedding(x), len(PATCH_SIZES), dim=1)
        keys = torch.chunk(self.key_embedding(x), len(PATCH_SIZES), dim=1)
        values = torch.chunk(self.value_embedding(x), len(PATCH_SIZES), dim=1)

        output = []
        for (width, height), query, key, value in zip(PATCH_SIZES, queries, keys, values, strict=True):
            out_w, out_h = w // width, h // height

            shape = (t, d_k, out_h, height, out_w, width)
            q, k, v = _tokens(query, shape), _tokens(key, shape), _tokens(value, shape)
            # Scale first: these dot products are tens of thousands long and overflow float16.
            scores = torch.matmul(q / math.sqrt(q.size(-1)), k.transpose(-2, -1))
            y = torch.matmul(F.softmax(scores, dim=-1), v)
            y = y.view(t, out_h, out_w, d_k, height, width)
            output.append(y.permute(0, 3, 1, 4, 2, 5).contiguous().view(t, d_k, h, w))
        return self.output_linear(torch.cat(output, 1))


class FeedForward(nn.Module):
    def __init__(self, d_model: int) -> None:
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(d_model, d_model, kernel_size=3, padding=2, dilation=2),
            nn.LeakyReLU(0.2, inplace=True),
            nn.Conv2d(d_model, d_model, kernel_size=3, padding=1),
            nn.LeakyReLU(0.2, inplace=True),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.conv(x)


class TransformerBlock(nn.Module):
    def __init__(self, hidden: int) -> None:
        super().__init__()
        self.attention = MultiHeadedAttention(hidden)
        self.feed_forward = FeedForward(hidden)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x + self.attention(x)
        return x + self.feed_forward(x)


class InpaintGenerator(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.transformer = nn.Sequential(*[TransformerBlock(CHANNELS) for _ in range(STACK_DEPTH)])
        self.encoder = nn.Sequential(
            nn.Conv2d(3, 64, kernel_size=3, stride=2, padding=1),
            nn.LeakyReLU(0.2, inplace=True),
            nn.Conv2d(64, 64, kernel_size=3, stride=1, padding=1),
            nn.LeakyReLU(0.2, inplace=True),
            nn.Conv2d(64, 128, kernel_size=3, stride=2, padding=1),
            nn.LeakyReLU(0.2, inplace=True),
            nn.Conv2d(128, CHANNELS, kernel_size=3, stride=1, padding=1),
            nn.LeakyReLU(0.2, inplace=True),
        )
        self.decoder = nn.Sequential(
            Deconv(CHANNELS, 128),
            nn.LeakyReLU(0.2, inplace=True),
            nn.Conv2d(128, 64, kernel_size=3, stride=1, padding=1),
            nn.LeakyReLU(0.2, inplace=True),
            Deconv(64, 64),
            nn.LeakyReLU(0.2, inplace=True),
            nn.Conv2d(64, 3, kernel_size=3, stride=1, padding=1),
        )
