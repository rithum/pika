// static/prompt-button-wc.js
(function () {
    const tpl = document.createElement('template');
    tpl.innerHTML = `
      <style>
        :host { display:block; font: 14px system-ui, sans-serif; }
        .placeholder { padding: 12px; color: #6b7280; background:#f3f4f6; border-radius: 8px; }
        .btn {
          display:inline-flex; align-items:center; gap:8px;
          padding: 6px 10px; border-radius: 8px; background:#f3f4f6; color:#374151;
          cursor:pointer; border: 1px solid #e5e7eb;
        }
        .btn:hover { background:#e5e7eb; }
        .icon { width:16px; height:16px; display:inline-block; }
      </style>
      <div id="root"></div>
    `;

    class PromptButtonWC extends HTMLElement {
        static get observedAttributes() {
            return ['disabled'];
        }

        constructor() {
            super();
            this._segment = undefined;
            this._appState = undefined;
            this._chat = undefined;
            this._disabled = false;

            const shadow = this.attachShadow({ mode: 'open' });
            shadow.appendChild(tpl.content.cloneNode(true));
            this.$root = shadow.querySelector('#root');

            this._onPropsUpdated = this._onPropsUpdated.bind(this);
            this._onClick = this._onClick.bind(this);
        }

        // DOM properties (objects allowed)
        get segment() {
            return this._segment;
        }
        set segment(v) {
            this._segment = v;
            this._render();
        }

        get appState() {
            return this._appState;
        }
        set appState(v) {
            this._appState = v;
            this._render();
        }

        get chatAppState() {
            return this._chat;
        }
        set chatAppState(v) {
            this._chat = v;
            this._render();
        }

        get disabled() {
            return this._disabled;
        }
        set disabled(v) {
            this._disabled = typeof v === 'string' ? v === 'true' : !!v;
            if (this._disabled) this.setAttribute('disabled', '');
            else this.removeAttribute('disabled');
            this._render();
        }

        attributeChangedCallback(name, _old, val) {
            if (name === 'disabled') this._disabled = val !== null;
            this._render();
        }

        connectedCallback() {
            this.addEventListener('__propsUpdated__', this._onPropsUpdated);
            this._render();
        }
        disconnectedCallback() {
            this.removeEventListener('__propsUpdated__', this._onPropsUpdated);
        }

        _onPropsUpdated() {
            this._render();
        }

        _onClick() {
            if (this._disabled) return;
            try {
                if (this._chat) {
                    this._chat.chatInput = this._segment?.rawContent ?? '';
                    this._chat.sendMessage?.();
                } else if (this._appState?.log) {
                    this._appState.log('No chatAppState; clicked', { segment: this._segment });
                }
                this.dispatchEvent(
                    new CustomEvent('widget:event', {
                        detail: { name: 'promptClicked', segmentId: this._segment?.id },
                        bubbles: true,
                        composed: true
                    })
                );
            } catch (e) {
                console.error('[prompt-button-wc] click error', e);
            }
        }

        _render() {
            const seg = this._segment;
            if (!this.$root) return;

            if (seg?.streamingStatus === 'streaming') {
                this.$root.innerHTML = `
            <div class="placeholder" data-prompt-placeholder="${seg.id}" data-streaming-status="${seg.streamingStatus}">
              Loading prompt...
            </div>
          `;
                return;
            }
            const text = seg?.rawContent ?? 'Use prompt';
            this.$root.innerHTML = `
          <button class="btn" title="Click to use this prompt" data-prompt-button="${seg?.id ?? ''}" data-streaming-status="${seg?.streamingStatus ?? ''}" ${this._disabled ? 'disabled' : ''}>
            <span class="icon" aria-hidden="true">💬</span>
            <span>${escapeHtml(text)}</span>
          </button>
        `;
            const btn = this.$root.querySelector('button');
            btn?.addEventListener('click', this._onClick, { once: true });
        }
    }

    function escapeHtml(s) {
        return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
    }

    customElements.define('prompt-button-wc', PromptButtonWC);
})();
