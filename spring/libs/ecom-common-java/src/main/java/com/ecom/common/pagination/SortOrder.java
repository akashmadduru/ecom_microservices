package com.ecom.common.pagination;

/**
 * Sort order enumeration for query sorting.
 */
public enum SortOrder {
    ASC("ASC"),
    DESC("DESC");

    private final String value;

    SortOrder(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }

    /**
     * Parse a string into a SortOrder enum.
     * Case-insensitive.
     *
     * @param value the sort order string
     * @return the SortOrder enum value
     * @throws IllegalArgumentException if value is not valid
     */
    public static SortOrder fromString(String value) {
        if (value == null || value.isEmpty()) {
            return ASC;
        }

        try {
            return valueOf(value.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid sort order: " + value);
        }
    }
}
