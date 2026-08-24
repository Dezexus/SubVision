import pytest

from subvision.processing.ocr_engine import PaddleWrapper


def test_parse_results_empty():
    text, conf = PaddleWrapper.parse_results(None, 0.5)
    assert text == ""
    assert conf == 0.0


def test_parse_results_legacy_format():
    result = [
        [
            [
                [[0, 0], [10, 0], [10, 5], [0, 5]],
                ("Hello", 0.95),
            ],
        ]
    ]
    text, conf = PaddleWrapper.parse_results(result, 0.5)
    assert text == "Hello"
    assert conf == pytest.approx(0.95)


def test_parse_results_filters_low_confidence():
    result = [
        [
            [
                [[0, 0], [10, 0], [10, 5], [0, 5]],
                ("Low", 0.1),
            ],
        ]
    ]
    text, conf = PaddleWrapper.parse_results(result, 0.5)
    assert text == ""
    assert conf == 0.0
