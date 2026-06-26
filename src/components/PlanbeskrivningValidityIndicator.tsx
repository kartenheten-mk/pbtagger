import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDocumentStore } from '../store/useDocumentStore';
import {
  validatePlanbeskrivning,
  type PlanbeskrivningValidationError,
  type PlanbeskrivningValidationInfo,
  type PlanbeskrivningValidationWarning,
  type ValidationResult,
} from '../docx/PlanbeskrivningXmlBuilder';
import type { Category, Tag } from '../types';

const VALIDATION_DEBOUNCE_MS = 500;
const VALIDATION_INTERVAL_MS = 30000;

function getTagPreview(tag: Tag | undefined): string {
  if (!tag) return 'Okänd tagg';
  const shortUuid = tag.uuid.slice(0, 8);
  const para = tag.paragraphIndex !== undefined ? `, stycke ${tag.paragraphIndex + 1}` : '';
  const preview = tag.text?.replace(/\s+/g, ' ').trim().slice(0, 70) ?? '';
  return `Tagg ${shortUuid}${para}${preview ? ` — "${preview}${preview.length === 70 ? '…' : ''}"` : ''}`;
}

type ValidationIssueKind = 'error' | 'warning' | 'info';
type ValidationIssue =
  | PlanbeskrivningValidationError
  | PlanbeskrivningValidationWarning
  | PlanbeskrivningValidationInfo;

const ISSUE_STYLES: Record<
  ValidationIssueKind,
  {
    item: string;
    badge: string;
    preview: string;
    message: string;
    button: string;
    label: string;
  }
> = {
  error: {
    item: 'border-red-200 bg-white',
    badge: 'bg-red-100 text-red-700',
    preview: 'text-red-900',
    message: 'text-red-700',
    button: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
    label: 'Fel',
  },
  warning: {
    item: 'border-amber-200 bg-white',
    badge: 'bg-amber-100 text-amber-700',
    preview: 'text-amber-900',
    message: 'text-amber-700',
    button: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
    label: 'Varning',
  },
  info: {
    item: 'border-blue-200 bg-white',
    badge: 'bg-blue-100 text-blue-700',
    preview: 'text-blue-900',
    message: 'text-blue-700',
    button: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
    label: 'Info',
  },
};

function ValidationIssueRow({
  kind,
  issue,
  tag,
  onShowTag,
}: {
  kind: ValidationIssueKind;
  issue: ValidationIssue;
  tag: Tag | undefined;
  onShowTag: (tagUuid: string) => void;
}) {
  const styles = ISSUE_STYLES[kind];
  const rule = 'rule' in issue ? issue.rule : styles.label;
  return (
    <li className={`rounded-lg border p-2.5 ${styles.item}`}>
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${styles.badge}`}>
          {rule}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-semibold ${styles.preview}`}>
            {getTagPreview(tag)}
          </p>
          <p className={`mt-1 break-words text-xs leading-relaxed [overflow-wrap:anywhere] ${styles.message}`}>
            {issue.message}
          </p>
        </div>
        {issue.tagUuid && (
          <button
            type="button"
            onClick={() => onShowTag(issue.tagUuid!)}
            className={`flex-shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${styles.button}`}
          >
            Visa tagg
          </button>
        )}
      </div>
    </li>
  );
}

interface PlanbeskrivningValidityIndicatorProps {
  categories?: Category[];
}

export const PlanbeskrivningValidityIndicator: React.FC<PlanbeskrivningValidityIndicatorProps> = ({
  categories,
}) => {
  const { tags, geometries, selectTag } = useDocumentStore();
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const runValidation = useCallback(() => {
    setValidation(validatePlanbeskrivning(tags, geometries, categories));
  }, [tags, geometries, categories]);

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
  const infoCount = validation?.infos.length ?? 0;
  const hasErrors = errorCount > 0;
  const hasWarnings = warningCount > 0;
  const hasInfos = infoCount > 0;

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
        : hasInfos
          ? `Inga fel eller varningar. ${infoCount} informationspost${infoCount === 1 ? '' : 'er'}.`
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
              : hasInfos
                ? 'text-blue-600 bg-blue-50 hover:bg-blue-100 focus:ring-blue-300'
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

            {hasInfos && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-blue-800">
                <p className="mb-2 text-xs font-semibold">Information ({infoCount})</p>
                <ul className="space-y-2 text-xs leading-relaxed">
                  {validation?.infos.slice(0, 8).map((info, index) => (
                    <ValidationIssueRow
                      key={`${info.tagUuid ?? 'unknown'}-${index}-${info.message}`}
                      kind="info"
                      issue={info}
                      tag={info.tagUuid ? tagByUuid.get(info.tagUuid) : undefined}
                      onShowTag={handleShowTag}
                    />
                  ))}
                </ul>
                {infoCount > 8 && (
                  <p className="mt-2 text-xs font-medium">+ {infoCount - 8} fler informationsposter</p>
                )}
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
};
