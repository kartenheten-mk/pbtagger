import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDocumentStore } from '../store/useDocumentStore';
import {
  validatePlanbeskrivning,
  type PlanbeskrivningValidationError,
  type PlanbeskrivningValidationWarning,
  type ValidationResult,
} from '../docx/PlanbeskrivningXmlBuilder';
import type { Tag } from '../types';

const VALIDATION_DEBOUNCE_MS = 500;
const VALIDATION_INTERVAL_MS = 30000;

function formatCheckedTime(date: Date | null): string {
  if (!date) return 'inte kontrollerat ännu';
  return date.toLocaleTimeString('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getTagPreview(tag: Tag | undefined): string {
  if (!tag) return 'Okänd tagg';
  const shortUuid = tag.uuid.slice(0, 8);
  const para = tag.paragraphIndex !== undefined ? `, stycke ${tag.paragraphIndex + 1}` : '';
  const preview = tag.text?.replace(/\s+/g, ' ').trim().slice(0, 70) ?? '';
  return `Tagg ${shortUuid}${para}${preview ? ` — "${preview}${preview.length === 70 ? '…' : ''}"` : ''}`;
}

function ValidationIssueRow({
  kind,
  issue,
  tag,
  onShowTag,
}: {
  kind: 'error' | 'warning';
  issue: PlanbeskrivningValidationError | PlanbeskrivningValidationWarning;
  tag: Tag | undefined;
  onShowTag: (tagUuid: string) => void;
}) {
  const isError = kind === 'error';
  const rule = 'rule' in issue ? issue.rule : 'Varning';
  return (
    <li className={`rounded-lg border p-2.5 ${isError ? 'border-red-200 bg-white' : 'border-amber-200 bg-white'}`}>
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${isError ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
          {rule}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-semibold ${isError ? 'text-red-900' : 'text-amber-900'}`}>
            {getTagPreview(tag)}
          </p>
          <p className={`mt-1 break-words text-xs leading-relaxed [overflow-wrap:anywhere] ${isError ? 'text-red-700' : 'text-amber-700'}`}>
            {issue.message}
          </p>
        </div>
        {issue.tagUuid && (
          <button
            type="button"
            onClick={() => onShowTag(issue.tagUuid!)}
            className={`flex-shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
              isError
                ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
          >
            Visa tagg
          </button>
        )}
      </div>
    </li>
  );
}

export const PlanbeskrivningValidityIndicator: React.FC = () => {
  const { tags, geometries, selectTag } = useDocumentStore();
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const runValidation = useCallback(() => {
    setValidation(validatePlanbeskrivning(tags, geometries));
    setLastCheckedAt(new Date());
  }, [tags, geometries]);

  useEffect(() => {
    const timer = window.setTimeout(runValidation, VALIDATION_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [runValidation]);

  useEffect(() => {
    const interval = window.setInterval(runValidation, VALIDATION_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [runValidation]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const errorCount = validation?.errors.length ?? 0;
  const warningCount = validation?.warnings.length ?? 0;
  const hasErrors = errorCount > 0;
  const hasWarnings = warningCount > 0;

  const tagByUuid = useMemo(() => new Map(tags.map((tag) => [tag.uuid, tag])), [tags]);

  const handleShowTag = useCallback(
    (tagUuid: string) => {
      selectTag(tagUuid);
      setOpen(false);
    },
    [selectTag]
  );

  const title = validation
    ? hasErrors
      ? `${errorCount} möjliga Planbeskrivning-exportfel hittades`
      : hasWarnings
        ? `Inga blockerande exportfel. ${warningCount} varning(ar).`
        : 'Inga Planbeskrivning-exportfel hittades'
    : 'Kontrollerar Planbeskrivning-export…';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title={title}
        aria-label={title}
        aria-expanded={open}
        className={`relative p-1.5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${
          hasErrors
            ? 'text-red-600 bg-red-50 hover:bg-red-100 focus:ring-red-300'
            : hasWarnings
              ? 'text-amber-600 bg-amber-50 hover:bg-amber-100 focus:ring-amber-300'
              : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 focus:ring-emerald-300'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12.75L11.25 15 15 9.75M12 3.75l7.5 3.75v4.875c0 4.214-2.874 8.024-7.5 9.375-4.626-1.351-7.5-5.161-7.5-9.375V7.5L12 3.75z"
          />
        </svg>
        {hasErrors && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            !
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100vh-5rem)] overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl z-[110]">
          <div className="flex items-start justify-between gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">Planbeskrivning exportkontroll</p>
              <p className="mt-0.5 text-[11px] text-gray-500">
                Senast kontrollerad {formatCheckedTime(lastCheckedAt)}. Kontrolleras även var {VALIDATION_INTERVAL_MS / 1000}:e sekund.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-0.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
              aria-label="Stäng exportkontroll"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-3 p-4">
            {hasErrors ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">!</span>
                  <p className="text-sm font-semibold">
                    {errorCount} möjlig{errorCount === 1 ? 't' : 'a'} exportfel hittad{errorCount === 1 ? 'es' : 'es'}
                  </p>
                </div>
                <ul className="space-y-2">
                  {validation?.errors.map((error, index) => (
                    <ValidationIssueRow
                      key={`${error.rule}-${error.tagUuid ?? 'unknown'}-${index}`}
                      kind="error"
                      issue={error}
                      tag={error.tagUuid ? tagByUuid.get(error.tagUuid) : undefined}
                      onShowTag={handleShowTag}
                    />
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
                <p className="text-sm font-semibold">Inga blockerande Planbeskrivning-exportfel hittades.</p>
              </div>
            )}

            {hasWarnings && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
                <p className="mb-2 text-xs font-semibold">Varningar ({warningCount})</p>
                <ul className="space-y-2 text-xs leading-relaxed">
                  {validation?.warnings.slice(0, 8).map((warning, index) => (
                    <ValidationIssueRow
                      key={`${warning.tagUuid ?? 'unknown'}-${index}-${warning.message}`}
                      kind="warning"
                      issue={warning}
                      tag={warning.tagUuid ? tagByUuid.get(warning.tagUuid) : undefined}
                      onShowTag={handleShowTag}
                    />
                  ))}
                </ul>
                {warningCount > 8 && (
                  <p className="mt-2 text-xs font-medium">+ {warningCount - 8} fler varningar</p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={runValidation}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-800"
            >
              Kontrollera igen nu
            </button>
          </div>
        </div>
      )}
    </div>
  );
};