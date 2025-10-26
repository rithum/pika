import { defineMarkdocConfig, component, nodes } from '@astrojs/markdoc/config';
import starlightMarkdoc from '@astrojs/starlight-markdoc';

export default defineMarkdocConfig({
    extends: [starlightMarkdoc()],
    nodes: {
        image: {
            render: component('./src/components/Zoom.astro'),
            attributes: {
                src: { type: String },
                alt: { type: String },
                title: { type: String }
            }
        }
    },
    tags: {
        counter: {
            render: component('./src/components/Counter.astro'),
            attributes: {
                // Enable client-side interactivity for static builds
                clientLoad: {
                    type: Boolean,
                    default: true
                }
            }
        },
        collapsible: {
            render: component('./src/components/Collapsible.astro'),
            attributes: {
                title: {
                    type: String,
                    required: true
                },
                expanded: {
                    type: Boolean,
                    default: false
                },
                clientLoad: {
                    type: Boolean,
                    default: true
                }
            }
        },
        zoom: {
            render: component('./src/components/Zoom.astro'),
            attributes: {
                label: {
                    type: String,
                    required: true
                },
                clientLoad: {
                    type: Boolean,
                    default: true
                }
            }
        },
        badge: {
            render: component('./src/components/Badge.astro'),
            attributes: {
                text: {
                    type: String,
                    required: true
                },
                variant: {
                    type: String,
                    default: 'default'
                },
                size: {
                    type: String,
                    default: 'small'
                }
            }
        },
        fancyCard: {
            render: component('./src/components/FancyCard.astro'),
            attributes: {
                title: {
                    type: String,
                    required: true
                },
                bgColor: {
                    type: String,
                    default: 'transparent'
                },
                clientLoad: {
                    type: Boolean,
                    default: true
                }
            }
        }
    }
});
