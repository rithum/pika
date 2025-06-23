import type { VisibilityState } from '@tanstack/table-core';
import type { AppSettings, TableSettings } from '../types';

const SETTINGS_KEY = 'app-settings';

export class AppSettingsState {
    dialogCreated = $state(false);
    dialogOpen = $state(false);
    data = $state<AppSettings>(this.#getSettings());

    constructor() {
        $effect(() => {
            // Automatically save settings to local storage when they change
            this.#saveSettingsToLocalStorage(this.data);
        });
    }

    showDialog() {
        if (!this.dialogCreated) {
            this.dialogCreated = true;
        }

        this.dialogOpen = true;
    }

    hideDialog() {
        this.dialogOpen = false;
    }

    toggleTooltips() {
        this.data.hideTooltips = !this.data.hideTooltips;
    }

    getTableNumRows(tableKey: string, defaultNumRows: number): number {
        const index = (this.data.tableSettings ?? []).findIndex((t) => t.key === tableKey);
        return index === -1 ? defaultNumRows : (this.data.tableSettings![index].numRows ?? defaultNumRows);
    }

    setTableNumRows(tableKey: string, numRows: number) {
        const index = (this.data.tableSettings ?? []).findIndex((t) => t.key === tableKey);
        if (index === -1) {
            this.data.tableSettings?.push({ key: tableKey, numRows });
        } else {
            this.data.tableSettings![index].numRows = numRows;
        }
    }

    getTableColumnVisibilityObject(tableKey: string): VisibilityState {
        const index = (this.data.tableSettings ?? []).findIndex((t) => t.key === tableKey);
        return index === -1
            ? {}
            : (this.data.tableSettings![index].hiddenColumns ?? []).reduce((acc, col) => {
                  acc[col] = false;
                  return acc;
              }, {} as VisibilityState);
    }

    setTableColumnVisibilityFromObject(tableKey: string, visibility: VisibilityState) {
        Object.entries(visibility).forEach(([col, visible]) => {
            this.setTableColumnVisibility(tableKey, col, visible);
        });
    }

    setTableColumnVisibility(tableKey: string, col: string, visible: boolean) {
        if (!this.data.tableSettings) {
            this.data.tableSettings = [];
        }

        const index = this.data.tableSettings.findIndex((t) => t.key === tableKey);
        if (index === -1) {
            this.data.tableSettings?.push({ key: tableKey, hiddenColumns: [] });
        }

        // Get a copy so it doesn't mutate the original
        let tableSettings: TableSettings = index === -1 ? { key: tableKey } : { ...this.data.tableSettings[index] };

        if (tableSettings.hiddenColumns) {
            if (visible) {
                tableSettings.hiddenColumns = tableSettings.hiddenColumns.filter((c) => c !== col);
            } else {
                // Add if not already present
                tableSettings.hiddenColumns = tableSettings.hiddenColumns.includes(col) ? tableSettings.hiddenColumns : [...tableSettings.hiddenColumns, col];
            }
        } else {
            if (!visible) {
                tableSettings.hiddenColumns = [col];
            }
        }

        // If we're adding a new table, add it to the end of the array
        if (index === -1) {
            this.data.tableSettings.push(tableSettings);
        } else {
            this.data.tableSettings[index] = tableSettings;
        }
    }

    #getSettings(): AppSettings {
        const settings = localStorage.getItem(SETTINGS_KEY);
        return this.#setDefaultSettings(settings ? JSON.parse(settings) : {});
    }

    #saveSettingsToLocalStorage(settings: AppSettings) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

    #setDefaultSettings(settings: AppSettings): AppSettings {
        if (!('hideTooltips' in settings)) {
            settings.hideTooltips = false;
        }
        return settings;
    }
}
