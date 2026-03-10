import React, { useState, useEffect, useRef } from 'react';
import { X, Bot, Sparkles } from 'lucide-react';

const MAX_NAME = 100;
const MAX_SOUL = 10000;
const MAX_KEY = 100;

export default function ManageAgentModal({ isOpen, onClose, project, onSave }) {
    const [name, setName] = useState('');
    const [soul, setSoul] = useState('');
    const [geminiApiKey, setGeminiApiKey] = useState('');
    const [saving, setSaving] = useState(false);
    const backdropRef = useRef(null);

    // Pre-fill when modal opens (or project changes)
    useEffect(() => {
        if (isOpen) {
            setName(project?.agent?.name ?? '');
            setSoul(project?.agent?.soul ?? '');
            setGeminiApiKey(project?.agent?.geminiApiKey ?? '');
            setSaving(false);
        }
    }, [isOpen, project]);

    const canSave = name.trim().length > 0 && soul.trim().length > 0 && !saving;

    const handleSave = async () => {
        if (!canSave) return;
        setSaving(true);
        try {
            await onSave({ projectId: project.id, name: name.trim(), soul: soul.trim(), geminiApiKey: geminiApiKey.trim() || null });
            onClose();
        } catch (e) {
            console.error('Failed to save agent:', e);
            setSaving(false);
        }
    };

    const handleBackdropClick = (e) => {
        if (e.target === backdropRef.current) onClose();
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
    };

    if (!isOpen) return null;

    return (
        <div
            ref={backdropRef}
            onClick={handleBackdropClick}
            onKeyDown={handleKeyDown}
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                backgroundColor: 'rgba(0,0,0,0.45)',
                backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '20px',
            }}
        >
            <div
                style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '16px',
                    boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
                    width: '100%',
                    maxWidth: '520px',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    animation: 'modalIn 0.18s ease',
                }}
            >
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '20px 24px 18px',
                    borderBottom: '1px solid #f1f5f9',
                }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: '10px',
                        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        <Bot size={18} color="#fff" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '15px', fontWeight: '700', color: '#111827' }}>Manage Agent</div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '1px' }}>
                            {project?.title}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none', border: 'none', padding: '6px', borderRadius: '8px',
                            cursor: 'pointer', color: '#9ca3af', display: 'flex',
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {/* Agent Name */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Agent Name
                        </label>
                        <input
                            type="text"
                            maxLength={MAX_NAME}
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. Support Assistant"
                            style={{
                                width: '100%', padding: '10px 12px',
                                border: '1.5px solid #e5e7eb',
                                borderRadius: '8px',
                                fontSize: '14px',
                                color: '#111827',
                                outline: 'none',
                                transition: 'border-color 0.15s',
                                boxSizing: 'border-box',
                                fontFamily: 'inherit',
                            }}
                            onFocus={e => e.target.style.borderColor = '#6366f1'}
                            onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                        />
                        <div style={{ textAlign: 'right', fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                            {name.length} / {MAX_NAME}
                        </div>
                    </div>

                    {/* Agent Soul */}
                    <div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            <Sparkles size={12} color="#6366f1" />
                            Agent Soul
                        </label>
                        <textarea
                            maxLength={MAX_SOUL}
                            value={soul}
                            onChange={e => setSoul(e.target.value)}
                            placeholder="Describe the agent's personality, goals, tone, and behaviour…"
                            rows={9}
                            style={{
                                width: '100%', padding: '10px 12px',
                                border: '1.5px solid #e5e7eb',
                                borderRadius: '8px',
                                fontSize: '13px',
                                color: '#111827',
                                outline: 'none',
                                transition: 'border-color 0.15s',
                                resize: 'vertical',
                                boxSizing: 'border-box',
                                fontFamily: 'inherit',
                                lineHeight: '1.55',
                            }}
                            onFocus={e => e.target.style.borderColor = '#6366f1'}
                            onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                        />
                        <div style={{ textAlign: 'right', fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                            {soul.length} / {MAX_SOUL}
                        </div>
                    </div>

                    {/* Gemini API Key (optional) */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Gemini API Key
                            <span style={{ fontSize: '11px', fontWeight: '400', color: '#9ca3af', marginLeft: '6px', textTransform: 'none', letterSpacing: 0 }}>optional</span>
                        </label>
                        <input
                            type="password"
                            maxLength={MAX_KEY}
                            value={geminiApiKey}
                            onChange={e => setGeminiApiKey(e.target.value)}
                            placeholder="AIza…"
                            autoComplete="new-password"
                            style={{
                                width: '100%', padding: '10px 12px',
                                border: '1.5px solid #e5e7eb',
                                borderRadius: '8px',
                                fontSize: '14px',
                                color: '#111827',
                                outline: 'none',
                                transition: 'border-color 0.15s',
                                boxSizing: 'border-box',
                                fontFamily: 'inherit',
                            }}
                            onFocus={e => e.target.style.borderColor = '#6366f1'}
                            onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                        />
                        <div style={{ textAlign: 'right', fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                            {geminiApiKey.length} / {MAX_KEY}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    display: 'flex', justifyContent: 'flex-end', gap: '10px',
                    padding: '14px 24px 20px',
                    borderTop: '1px solid #f1f5f9',
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '9px 18px', borderRadius: '8px',
                            border: '1.5px solid #e5e7eb',
                            background: 'none', fontSize: '13px', fontWeight: '500',
                            color: '#374151', cursor: 'pointer',
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        Cancel
                    </button>
                    <button
                        disabled={!canSave}
                        onClick={handleSave}
                        style={{
                            padding: '9px 22px', borderRadius: '8px',
                            border: 'none',
                            background: canSave
                                ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                                : '#e5e7eb',
                            color: canSave ? '#ffffff' : '#9ca3af',
                            fontSize: '13px', fontWeight: '600',
                            cursor: canSave ? 'pointer' : 'not-allowed',
                            transition: 'opacity 0.15s, background 0.2s',
                            opacity: saving ? 0.7 : 1,
                        }}
                    >
                        {saving ? 'Saving…' : 'Save Agent'}
                    </button>
                </div>
            </div>

            <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
      `}</style>
        </div>
    );
}
