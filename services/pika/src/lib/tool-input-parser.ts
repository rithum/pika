import { jsonparse } from './jsonparse';

export const parsers: Record<string, (v: string) => any> = {
    date: (v: string) => new Date(v),
    number: (v: string) => parseFloat(v),
    integer: (v: string) => parseInt(v),
    identity: (v: string) => v,
    string: (v: string) => v.toString(),
    array: (v: string) => jsonparse(v)
};
