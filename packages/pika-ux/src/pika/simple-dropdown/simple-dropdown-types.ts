export interface SimpleDropdownMapping<T> {
    value: (item: T) => string;
    label: (item: T) => string;
    secondaryLabel?: (item: T) => string;
}
