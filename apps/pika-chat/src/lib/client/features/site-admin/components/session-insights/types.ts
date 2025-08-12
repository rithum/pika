import type { RecordOrUndef, SessionSearchRequest } from '@pika/shared/types/chatbot/chatbot-types';

export interface SavedSearch {
    id: string;
    name: string;
    searchParams: SessionSearchRequest<RecordOrUndef>;
    createdAt: Date;
    createdBy: string;
}

export interface ImageForLightbox {
    src: string;
    name: string;
    s3Url: string;
    alt: string;
}
