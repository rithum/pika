import { jsonrepair } from 'jsonrepair';

export function jsonparse<T>(data: string): T {
    try {
        return JSON.parse(data);
    } catch (e) {
        return JSON.parse(jsonrepair(data));
    }
}
