import type { AppSettings } from '../types';

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
