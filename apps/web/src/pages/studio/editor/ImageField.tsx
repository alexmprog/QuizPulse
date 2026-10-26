import { IMAGE_MAX_BYTES } from '@quizpulse/protocol';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { ApiError } from '../../../api/client';
import { errorText } from '../../../i18n/errors';
import { formatMegabytes } from '../../../i18n/format';
import { useI18n } from '../../../i18n/i18n';
import { Button } from '../../../ui/Button';
import { Spinner } from '../../../ui/Spinner';
import { checkImage, uploadImage, type UploadHandle } from './upload';

interface ImageFieldProps {
    imageUrl: string | null;
    onChange: (img: { imageId: string; imageUrl: string } | null) => void;
}

type State =
    | { kind: 'idle' }
    | { kind: 'uploading'; file: File; loaded: number; total: number }
    | { kind: 'rejected'; file: File; reason: 'size' | 'type' }
    | { kind: 'failed'; file: File; error: ApiError | null };

const MAX_MB = IMAGE_MAX_BYTES / (1024 * 1024);

function formatName(file: File): string {
    const fromMime = file.type.split('/')[1];
    const fromName = file.name.includes('.') ? file.name.split('.').pop() : undefined;
    return (fromMime || fromName || file.name).toUpperCase();
}

export function ImageField({ imageUrl, onChange }: ImageFieldProps) {
    const { t, lang } = useI18n();
    const [state, setState] = useState<State>({ kind: 'idle' });
    const [dragging, setDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const handle = useRef<UploadHandle | null>(null);
    const onChangeRef = useRef(onChange);
    const hadImage = useRef(imageUrl !== null);
    useEffect(() => {
        onChangeRef.current = onChange;
        hadImage.current = imageUrl !== null;
    });

    useEffect(
        () => () => {
            handle.current?.abort();
        },
        [],
    );

    const choose = () => {
        inputRef.current?.click();
    };

    const start = (file: File) => {
        handle.current?.abort();
        const check = checkImage(file);
        if (!check.ok) {
            handle.current = null;
            setState({ kind: 'rejected', file, reason: check.reason });
            return;
        }
        setState({ kind: 'uploading', file, loaded: 0, total: file.size });
        const h = uploadImage(file, (loaded, total) => {
            if (handle.current === h) setState({ kind: 'uploading', file, loaded, total });
        });
        handle.current = h;
        h.promise.then(
            (img) => {
                if (handle.current !== h) return;
                handle.current = null;
                setState({ kind: 'idle' });
                onChangeRef.current({ imageId: img.id, imageUrl: img.url });
            },
            (e: unknown) => {
                if (handle.current !== h) return;
                handle.current = null;
                if (e instanceof DOMException && e.name === 'AbortError') return;
                // A failed upload must not leave the old picture attached to the question.
                if (hadImage.current) onChangeRef.current(null);
                setState({ kind: 'failed', file, error: e instanceof ApiError ? e : null });
            },
        );
    };

    const cancel = () => {
        const h = handle.current;
        handle.current = null;
        h?.abort();
        setState({ kind: 'idle' });
    };

    const remove = () => {
        setState({ kind: 'idle' });
        onChange(null);
    };

    const onFiles = (files: FileList | null) => {
        const file = files?.[0];
        if (file) start(file);
    };

    const onDrop = (e: DragEvent) => {
        e.preventDefault();
        setDragging(false);
        onFiles(e.dataTransfer.files);
    };

    const dropProps = {
        onDragOver: (e: DragEvent) => {
            e.preventDefault();
            setDragging(true);
        },
        onDragLeave: () => {
            setDragging(false);
        },
        onDrop,
    };

    const maxText = `${String(MAX_MB)} ${t.editor.image.mb}`;
    const previewRow =
        imageUrl === null ? null : (
            <div className="image-row">
                <img className="image-preview" src={imageUrl} alt={t.editor.image.preview} />
                <div className="image-info">
                    <span className="hint">{t.editor.image.bigScreenOnly}</span>
                </div>
                <Button size="sm" onClick={choose}>
                    {t.editor.image.replace}
                </Button>
                <Button variant="danger-ghost" size="sm" onClick={remove}>
                    {t.editor.image.remove}
                </Button>
            </div>
        );
    let body;
    if (state.kind === 'uploading') {
        const percent = state.total > 0 ? Math.min(100, Math.round((state.loaded / state.total) * 100)) : 0;
        body = (
            <div className="image-row">
                <Spinner label={t.editor.image.uploading} />
                <div className="image-info">
                    <span className="image-name">{state.file.name}</span>
                    <div
                        className="image-bar"
                        role="progressbar"
                        aria-label={t.editor.image.uploading}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent}
                    >
                        <div className="image-bar-fill" style={{ width: `${String(percent)}%` }} />
                    </div>
                    <span className="hint tnum image-percent">{String(percent)}%</span>
                    <span className="hint tnum">
                        {t.editor.image.progress(
                            formatMegabytes(lang, state.loaded),
                            `${formatMegabytes(lang, state.total)} ${t.editor.image.mb}`,
                        )}
                    </span>
                </div>
                <Button size="sm" onClick={cancel}>
                    {t.editor.image.cancel}
                </Button>
            </div>
        );
    } else if (state.kind === 'failed') {
        body = (
            <div className="image-row image-row-danger" role="alert">
                <div className="image-icon" aria-hidden="true">
                    <svg
                        width="28"
                        height="28"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                    >
                        <path d="M2 2l20 20M5 13a10 10 0 0 1 5.2-2.8M8.5 16.5a5 5 0 0 1 7 0M12 20h.01M19 13a10 10 0 0 0-2.3-1.7" />
                    </svg>
                </div>
                <div className="image-info">
                    <span className="image-name">{state.file.name}</span>
                    <span className="err">
                        {state.error && state.error.status !== 0
                            ? errorText(t, state.error.code)
                            : t.editor.image.failedDetail}
                    </span>
                </div>
                {(state.error === null || state.error.status === 0 || state.error.status >= 500) && (
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                            start(state.file);
                        }}
                    >
                        {t.editor.image.retry}
                    </Button>
                )}
                <Button variant="danger-ghost" size="sm" onClick={remove}>
                    {t.editor.image.remove}
                </Button>
            </div>
        );
    } else if (state.kind === 'rejected') {
        body = (
            <>
                <div
                    className={`image-zone image-zone-danger${dragging ? ' dragging' : ''}`}
                    role="alert"
                    {...dropProps}
                >
                    <strong>{state.reason === 'size' ? t.editor.image.tooBig : t.editor.image.badType}</strong>
                    <span className="err">
                        {state.reason === 'size'
                            ? t.editor.image.tooBigDetail(
                                  `${formatMegabytes(lang, state.file.size)} ${t.editor.image.mb}`,
                                  maxText,
                              )
                            : t.editor.image.badTypeDetail(formatName(state.file))}
                    </span>
                    <span className="hint">
                        {t.editor.image.chooseAgain}{' '}
                        <button type="button" className="link image-link" onClick={choose}>
                            {t.editor.image.choose}
                        </button>
                    </span>
                </div>
                {previewRow}
            </>
        );
    } else if (previewRow) {
        body = previewRow;
    } else {
        body = (
            <button
                type="button"
                className={`image-zone${dragging ? ' dragging' : ''}`}
                onClick={choose}
                {...dropProps}
            >
                <span>{t.editor.image.drop}</span>
                <span className="hint">{t.editor.image.formats(MAX_MB)}</span>
            </button>
        );
    }

    return (
        <div className="field image-field" data-slot="image-field">
            <span className="label">{t.editor.image.title}</span>
            {body}
            <input
                ref={inputRef}
                hidden
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label={t.editor.image.choose}
                onChange={(e) => {
                    onFiles(e.target.files);
                    e.target.value = '';
                }}
            />
        </div>
    );
}
