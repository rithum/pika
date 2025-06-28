export interface ComboboxMapping<T> {
    value: (item: T) => string;
    label: (item: T) => string;
    secondaryLabel?: (item: T) => string;
}
