import { type ThinkSegment } from "./types"

const START_TAG = "<think>";
const END_TAG = "</think>";
const START_TAG_LENGTH = START_TAG.length;
const END_TAG_LENGTH = END_TAG.length;

export class ThinkTagParser {
    private buffer = "";
    private mode: "text" | "thinking" = "text";

    push(text: string | undefined | null): ThinkSegment[] {
        if (!text) {
            return [];
        }

        this.buffer += text;
        const segments: ThinkSegment[] = [];

        while (this.buffer.length > 0) {
            if (this.mode === "text") {
                const startIndex = this.buffer.indexOf(START_TAG);
                if (startIndex === -1) {
                    const emitLength = this.safeEmitLength(START_TAG_LENGTH);
                    if (emitLength === 0) {
                        break;
                    }
                    const emitValue = this.buffer.slice(0, emitLength);
                    if (emitValue.length > 0) {
                        segments.push({ kind: "text", value: emitValue });
                    }
                    this.buffer = this.buffer.slice(emitLength);
                    continue;
                }

                const textBefore = this.buffer.slice(0, startIndex);
                if (textBefore.length > 0) {
                    segments.push({ kind: "text", value: textBefore });
                }
                this.buffer = this.buffer.slice(startIndex + START_TAG_LENGTH);
                this.mode = "thinking";
            } else {
                const endIndex = this.buffer.indexOf(END_TAG);
                if (endIndex === -1) {
                    const emitLength = this.safeEmitLength(END_TAG_LENGTH);
                    if (emitLength === 0) {
                        break;
                    }
                    const emitValue = this.buffer.slice(0, emitLength);
                    if (emitValue.length > 0) {
                        segments.push({ kind: "thinking", value: emitValue });
                    }
                    this.buffer = this.buffer.slice(emitLength);
                    continue;
                }

                const thinkingContent = this.buffer.slice(0, endIndex);
                if (thinkingContent.length > 0) {
                    segments.push({ kind: "thinking", value: thinkingContent });
                }
                this.buffer = this.buffer.slice(endIndex + END_TAG_LENGTH);
                this.mode = "text";
            }
        }

        return segments;
    }

    flush(): ThinkSegment[] {
        if (this.buffer.length === 0) {
            return [];
        }

        const segment: ThinkSegment = { kind: this.mode, value: this.buffer };
        this.buffer = "";
        return [segment];
    }

    private safeEmitLength(tagLength: number): number {
        const minKeep = tagLength - 1;
        if (this.buffer.length <= minKeep) {
            return 0;
        }
        return this.buffer.length - minKeep;
    }
}