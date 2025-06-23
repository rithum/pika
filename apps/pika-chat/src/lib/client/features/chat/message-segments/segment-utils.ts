import type { MetadataTagSegment, ProcessedSegment } from './segment-types';
import type { ProcessedTextSegment } from './segment-types';
import type { ProcessedTagSegment } from './segment-types';

/** A typegaurd to check if a ProcessedSegment is a ProcessedTextSegment */
export function isProcessedTextSegment(segment: ProcessedSegment): segment is ProcessedTextSegment {
    return segment.segmentType === 'text';
}

/** A typegaurd to check if a ProcessedSegment is a ProcessedTagSegment */
export function isProcessedTagSegment(segment: ProcessedSegment): segment is ProcessedTagSegment {
    return segment.segmentType === 'tag' && !('isMetadata' in segment);
}

export function isMetadataTagSegment(segment: ProcessedSegment): segment is MetadataTagSegment {
    return segment.segmentType === 'tag' && 'isMetadata' in segment && segment.isMetadata === true;
}
