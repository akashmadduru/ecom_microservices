from ecom_common.pagination import build_pagination


def test_first_page():
    p = build_pagination(page=1, page_size=20, total=45)
    assert p.total_pages == 3
    assert p.has_previous is False
    assert p.has_next is True
    assert p.previous_page is None
    assert p.next_page == 2


def test_last_page():
    p = build_pagination(page=3, page_size=20, total=45)
    assert p.has_next is False
    assert p.next_page is None
    assert p.previous_page == 2


def test_empty_result_still_one_page():
    p = build_pagination(page=1, page_size=20, total=0)
    assert p.total_pages == 1
    assert p.has_next is False
    assert p.has_previous is False


def test_exact_multiple():
    p = build_pagination(page=2, page_size=10, total=20)
    assert p.total_pages == 2
    assert p.has_next is False
