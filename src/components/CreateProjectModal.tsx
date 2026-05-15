import React, { useState, useRef } from 'react';

interface CreateProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (projectName: string, docxFile: File, jsonFile: File | null) => void;
    isLoading?: boolean;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    isLoading
}) => {
    const [projectName, setProjectName] = useState('');
    const [docxFile, setDocxFile] = useState<File | null>(null);
    const [jsonFile, setJsonFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);

    const docxInputRef = useRef<HTMLInputElement>(null);
    const jsonInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleDocxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (!file.name.toLowerCase().endsWith('.docx')) {
                setError('Endast .docx-filer stöds för dokumentet.');
                return;
            }
            setDocxFile(file);
            setError(null);
        }
    };

    const handleJsonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (!file.name.toLowerCase().endsWith('.json')) {
                setError('Endast .json-filer stöds för geometri.');
                return;
            }
            setJsonFile(file);
            setError(null);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!docxFile) {
            setError('En .docx-fil krävs.');
            return;
        }
        onSubmit(projectName.trim(), docxFile, jsonFile);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-gray-800">Skapa nytt projekt</h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        disabled={isLoading}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6 flex-1 overflow-y-auto">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Project Name */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Projektnamn <span className="text-gray-400 font-normal">(valfritt)</span>
                            </label>
                            <input
                                type="text"
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value)}
                                placeholder="Ange projektnamn..."
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                                disabled={isLoading}
                            />
                            <p className="text-xs text-gray-500 mt-1">Om fältet lämnas tomt används .docx-filens namn.</p>
                        </div>

                        {/* Docx File Upload */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Dokumentfil <span className="text-red-500">*</span>
                            </label>
                            <div
                                onClick={() => docxInputRef.current?.click()}
                                className={`w-full border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
                                    docxFile ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/50'
                                } ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                                <input
                                    ref={docxInputRef}
                                    type="file"
                                    accept=".docx"
                                    className="hidden"
                                    onChange={handleDocxChange}
                                />
                                {docxFile ? (
                                    <div className="flex items-center justify-center gap-2 text-blue-700">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span className="font-medium text-sm truncate">{docxFile.name}</span>
                                    </div>
                                ) : (
                                    <div className="text-gray-500">
                                        <p className="text-sm font-medium text-gray-700">Klicka för att välja .docx-fil</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Json File Upload */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Geometrifil <span className="text-gray-400 font-normal">(valfritt)</span>
                            </label>
                            <div
                                onClick={() => jsonInputRef.current?.click()}
                                className={`w-full border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
                                    jsonFile ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-gray-50 hover:border-green-300 hover:bg-green-50/50'
                                } ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                                <input
                                    ref={jsonInputRef}
                                    type="file"
                                    accept=".json"
                                    className="hidden"
                                    onChange={handleJsonChange}
                                />
                                {jsonFile ? (
                                    <div className="flex items-center justify-center gap-2 text-green-700">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span className="font-medium text-sm truncate">{jsonFile.name}</span>
                                    </div>
                                ) : (
                                    <div className="text-gray-500">
                                        <p className="text-sm font-medium text-gray-700">Klicka för att välja .json-fil</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                                <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="text-sm text-red-600">{error}</p>
                            </div>
                        )}
                    </form>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isLoading}
                        className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 bg-gray-100 rounded-lg transition-colors"
                    >
                        Avbryt
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isLoading || !docxFile}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                <span>Skapar...</span>
                            </>
                        ) : (
                            'Skapa projekt'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
