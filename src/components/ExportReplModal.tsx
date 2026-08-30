import React, { useState } from 'react';
import {
  ExternalLink,
  Copy,
  Check,
  Download,
  Share2,
  X,
  Sparkles,
  Terminal,
  Code2,
  Globe,
} from 'lucide-react';
import {
  getStrudelOfficialReplUrl,
  openInOfficialStrudel,
  copyStrudelReplLink,
  copyRawCodeToClipboard,
  downloadStrudelFile,
} from '../utils/strudelExport';

interface ExportReplModalProps {
  isOpen: boolean;
  onClose: () => void;
  code: string;
  trackTitle?: string;
  bpm?: number;
}

export const ExportReplModal: React.FC<ExportReplModalProps> = ({
  isOpen,
  onClose,
  code,
  trackTitle = 'Strudel Pattern',
  bpm = 120,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  if (!isOpen) return null;

  const replUrl = getStrudelOfficialReplUrl(code);

  const handleCopyLink = async () => {
    const ok = await copyStrudelReplLink(code);
    if (ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleCopyCode = async () => {
    const ok = await copyRawCodeToClipboard(code);
    if (ok) {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleDownload = () => {
    downloadStrudelFile(code, trackTitle);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-[var(--app-card-1)] border border-gray-200 rounded-2xl w-full max-w-xl max-h-[90dvh] flex flex-col shadow-2xl font-mono overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 flex items-center justify-center shadow-inner">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-tight flex items-center gap-2">
                <span>Send to Official Strudel REPL</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                  strudel.cc
                </span>
              </h2>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Export and launch your pattern in the official TidalCycles Strudel editor
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 hover:text-gray-900 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
          {/* Primary Action Hero: Open in Official REPL */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 via-pink-500/5 to-cyan-500/10 border border-emerald-500/30 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>Instant Cloud Launch</span>
              </span>
              <span className="text-[10px] text-gray-500 font-medium">100% Compatible Code</span>
            </div>

            <p className="text-xs text-gray-700 leading-relaxed">
              Click below to encode this pattern and open it directly in the official{' '}
              <strong className="text-gray-900 font-semibold">strudel.cc REPL</strong> in a new tab.
            </p>

            <button
              onClick={() => openInOfficialStrudel(code)}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all uppercase tracking-wide"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Launch in strudel.cc REPL</span>
            </button>
          </div>

          {/* Shareable Link Box */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider flex items-center justify-between">
              <span>Strudel.cc Share URL</span>
              <span className="text-gray-500 font-normal">Base64 Hash Encoded</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={replUrl}
                className="flex-1 bg-[var(--app-card-1)] border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 select-all font-mono truncate focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={handleCopyLink}
                className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-all active:scale-95 shrink-0 uppercase tracking-tight ${
                  copiedLink
                    ? 'bg-emerald-500 text-white border-emerald-500'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-900 border-gray-200'
                }`}
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Copied Link!' : 'Copy Link'}</span>
              </button>
            </div>
          </div>

          {/* Secondary Actions: Copy Code & Download File */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-200">
            <button
              onClick={handleCopyCode}
              className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all active:scale-95 uppercase tracking-tight ${
                copiedCode
                  ? 'bg-emerald-500 text-white border-emerald-500'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-900 border-gray-200'
              }`}
            >
              {copiedCode ? <Check className="w-4 h-4" /> : <Code2 className="w-4 h-4" />}
              <span>{copiedCode ? 'Code Copied!' : 'Copy Raw Code'}</span>
            </button>

            <button
              onClick={handleDownload}
              className="p-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-900 border border-gray-200 flex items-center justify-center gap-2 text-xs font-bold transition-all active:scale-95 uppercase tracking-tight"
            >
              <Download className="w-4 h-4 text-pink-600" />
              <span>Download .js File</span>
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-[11px] text-gray-500">
          <span>Pattern: {trackTitle} ({bpm} BPM)</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-md font-bold text-[10px] uppercase transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
