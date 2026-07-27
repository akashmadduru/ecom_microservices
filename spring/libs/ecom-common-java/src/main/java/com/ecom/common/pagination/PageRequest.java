package com.ecom.common.pagination;

/**
 * Pagination parameters for list/search queries.
 * Mirrors python/libs/ecom_common/pagination.py:Pagination.
 *
 * Note: Lombok annotations removed due to Java 25 compatibility issues.
 */
public class PageRequest {
    private int page = 1;
    private int limit = 20;

    public PageRequest() {
    }

    public PageRequest(int page, int limit) {
        this.page = page;
        this.limit = limit;
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

    /**
     * Calculate offset for database queries.
     * Offset = (page - 1) * limit
     */
    public long getOffset() {
        return ((long) (page - 1) * limit);
    }

    /**
     * Validate pagination parameters.
     * @throws IllegalArgumentException if page < 1 or limit < 1
     */
    public void validate() {
        if (page < 1) {
            throw new IllegalArgumentException("page must be >= 1");
        }
        if (limit < 1) {
            throw new IllegalArgumentException("limit must be >= 1");
        }
    }
}
