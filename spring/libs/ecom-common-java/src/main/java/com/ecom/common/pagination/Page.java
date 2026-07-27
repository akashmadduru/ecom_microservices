package com.ecom.common.pagination;

import java.util.List;

/**
 * Paginated response wrapper.
 * Carries the current page, limit, total count, and the data items.
 *
 * Note: Lombok annotations removed due to Java 25 compatibility issues.
 */
public class Page<T> {
    private List<T> data;
    private int page;
    private int limit;
    private long total;

    public Page() {
    }

    public Page(List<T> data, int page, int limit, long total) {
        this.data = data;
        this.page = page;
        this.limit = limit;
        this.total = total;
    }

    public List<T> getData() {
        return data;
    }

    public void setData(List<T> data) {
        this.data = data;
    }

    public int getPage() {
        return page;
    }

    public void setPage(int page) {
        this.page = page;
    }

    public int getLimit() {
        return limit;
    }

    public void setLimit(int limit) {
        this.limit = limit;
    }

    public long getTotal() {
        return total;
    }

    public void setTotal(long total) {
        this.total = total;
    }

    /**
     * Calculate the total number of pages.
     */
    public long getTotalPages() {
        if (limit == 0) {
            return 0;
        }
        return (total + limit - 1) / limit;
    }

    /**
     * Check if there are more pages after this one.
     */
    public boolean hasMore() {
        return page < getTotalPages();
    }

    /**
     * Create a new page from a list, offset, and total count.
     */
    public static <T> Page<T> of(List<T> data, int page, int limit, long total) {
        return new Page<>(data, page, limit, total);
    }

    @Override
    public String toString() {
        return "Page{" +
                "data=" + data +
                ", page=" + page +
                ", limit=" + limit +
                ", total=" + total +
                '}';
    }
}
