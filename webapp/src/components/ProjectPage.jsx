import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Send, Clock, ChevronDown, ChevronRight, Plus, Sparkles, RefreshCw, Settings, Bold, Italic, Underline, List } from 'lucide-react';
import { gql, GraphQLClient } from 'graphql-request';

const BACKEND_URL = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:8000/graphql';
const gqlClient = new GraphQLClient(BACKEND_URL, {
    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
});

const GET_PROJECT_QUERY = gql`
  query GetProject($id: Int!) {
    project(id: $id) {
      id title pictureUrl description
      members { id email isRemoved lastOnline typingUntil }
    }
  }
`;

const GET_MESSAGES_QUERY = gql`
  query GetMessages($projectId: Int!, $memberEmail: String!) {
    messages(projectId: $projectId, memberEmail: $memberEmail) {
      id content sender sentAt isRead memberEmail
    }
  }
`;

const UNREAD_COUNTS_QUERY = gql`
  query UnreadCounts($projectId: Int!) {
    unreadCounts(projectId: $projectId)
  }
`;

const SEND_MESSAGE_MUTATION = gql`
  mutation SendMessage($projectId: Int!, $memberEmail: String!, $content: String!, $sender: String!) {
    sendMessage(projectId: $projectId, memberEmail: $memberEmail, content: $content, sender: $sender) {
      id content sender sentAt
    }
  }
`;

const MARK_READ_MUTATION = gql`
  mutation MarkRead($projectId: Int!, $memberEmail: String!) {
    markMessagesRead(projectId: $projectId, memberEmail: $memberEmail)
  }
`;

const UPDATE_OPERATOR_TYPING_MUTATION = gql`
  mutation UpdateOperatorTyping($projectId: Int!, $email: String!, $isTyping: Boolean!) {
    updateOperatorTypingStatus(projectId: $projectId, email: $email, isTyping: $isTyping)
  }
`;

const SUGGEST_RESPONSE_QUERY = gql`
  query SuggestResponse($projectId: Int!, $memberEmail: String!, $force: Boolean!) {
    suggestResponse(projectId: $projectId, memberEmail: $memberEmail, force: $force)
  }
`;

// ─── helpers ──────────────────────────────────────────────────

function formatLastOnline(isoStr) {
    if (!isoStr) return 'Never online';
    if (isOnline(isoStr)) return 'Online';
    const date = new Date(isoStr);
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return date.toLocaleDateString();
}

function formatSentTime(isoStr) {
    const date = new Date(isoStr + (isoStr.endsWith('Z') ? '' : 'Z'));
    // Show local time HH:MM
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isOnline(isoStr) {
    if (!isoStr) return false;
    const date = new Date(isoStr + (isoStr.endsWith('Z') ? '' : 'Z'));
    const diffMs = Date.now() - date.getTime();
    return diffMs < 15 * 1000; // within 15 seconds
}

// Allow only safe formatting tags
function sanitizeHtml(html) {
    const allowed = new Set(['b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'br', 'p', 'span']);
    const div = document.createElement('div');
    div.innerHTML = html;
    const clean = (node) => {
        if (node.nodeType === Node.TEXT_NODE) return;
        if (node.nodeType === Node.ELEMENT_NODE) {
            if (!allowed.has(node.tagName.toLowerCase())) {
                node.replaceWith(...node.childNodes);
                return;
            }
            // Strip all attributes except safe ones
            [...node.attributes].forEach(a => node.removeAttribute(a.name));
        }
        [...node.childNodes].forEach(clean);
    };
    [...div.childNodes].forEach(clean);
    return div.innerHTML;
}

// ─── component ────────────────────────────────────────────────

const ProjectPage = ({ projectId, project: projectFromApp, onBack, onOpenAgent }) => {
    const [project, setProject] = useState(null);
    const [selectedEmail, setSelectedEmail] = useState(null);
    const [messages, setMessages] = useState([]);
    const [unreadCounts, setUnreadCounts] = useState({});
    const [messageInput, setMessageInput] = useState('');
    const [removedOpen, setRemovedOpen] = useState(false);
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef(null);
    const editorRef = useRef(null);       // contentEditable ref
    const pollRef = useRef(null);
    const lastOperatorPingRef = useRef(0);
    const typingTimeoutRef = useRef(null);

    // agent panel state: null | 'loading' | { suggestion: string } | 'no-response' | { error: string }
    const [agentState, setAgentState] = useState(null);
    // track last message id we auto-suggested for (to avoid re-triggering on same messages)
    const lastSuggestedMsgIdRef = useRef(null);
    const agentFromApp = projectFromApp?.agent ?? null;
    // keep a ref so requestSuggestion never has a stale closure
    const agentRef = useRef(agentFromApp);
    const selectedEmailRef = useRef(null);
    useEffect(() => { agentRef.current = agentFromApp; }, [agentFromApp]);
    useEffect(() => { selectedEmailRef.current = selectedEmail; }, [selectedEmail]);

    // ── fetch project ──────────────────────────────────────────
    const fetchProject = useCallback(async () => {
        try {
            const data = await gqlClient.request(GET_PROJECT_QUERY, { id: projectId });
            setProject(data.project);
        } catch (e) {
            console.error('fetchProject error', e);
        }
    }, [projectId]);

    // ── fetch unread counts for ALL members ──────────────────
    const fetchUnread = useCallback(async (currentSelectedEmail) => {
        try {
            const data = await gqlClient.request(UNREAD_COUNTS_QUERY, { projectId });
            const counts = JSON.parse(data.unreadCounts);

            // if we have unreads for the currently open chat, mark them read instantly
            if (currentSelectedEmail && counts[currentSelectedEmail] > 0) {
                await gqlClient.request(MARK_READ_MUTATION, { projectId, memberEmail: currentSelectedEmail });
                counts[currentSelectedEmail] = 0;
            }

            setUnreadCounts(counts);
        } catch (e) {
            console.error('fetchUnread error', e);
        }
    }, [projectId]);

    // ── fetch messages for selected member ────────────────────
    const fetchMessages = useCallback(async (email) => {
        if (!email) return [];
        try {
            const data = await gqlClient.request(GET_MESSAGES_QUERY, {
                projectId,
                memberEmail: email,
            });
            const msgs = data.messages || [];
            setMessages(msgs);
            return msgs;
        } catch (e) {
            console.error('fetchMessages error', e);
            return [];
        }
    }, [projectId]);

    // ── request an agent suggestion ───────────────────────────
    const requestSuggestion = useCallback(async (email, force = false) => {
        const agent = agentRef.current;          // always fresh, no stale closure
        if (!agent?.geminiApiKey) return;
        if (!email) return;
        setAgentState('loading');
        try {
            const data = await gqlClient.request(SUGGEST_RESPONSE_QUERY, {
                projectId,
                memberEmail: email,
                force,
            });

            // IF the user has switched members since we started this request, DO NOT apply it.
            if (selectedEmailRef.current !== email) {
                console.log("Suggestion arrived but user switched chat. Ignoring.");
                return;
            }

            const raw = data.suggestResponse;
            if (raw === null || raw === undefined) {
                setAgentState(null);
            } else if (raw === '__NO_RESPONSE__') {
                setAgentState('no-response');
            } else if (raw.startsWith('__ERROR__:')) {
                setAgentState({ error: raw.slice(10) });
            } else {
                setAgentState({ suggestion: raw });
            }
        } catch (e) {
            if (selectedEmailRef.current === email) {
                setAgentState({ error: String(e) });
            }
        }
    }, [projectId]);  // agentRef and selectedEmailRef are refs, no need in deps

    // ── mark messages as read when selecting member ───────────
    const selectMember = useCallback(async (email) => {
        setSelectedEmail(email);
        setAgentState(null);
        lastSuggestedMsgIdRef.current = null;
        const msgs = await fetchMessages(email);
        // mark read
        try {
            await gqlClient.request(MARK_READ_MUTATION, { projectId, memberEmail: email });
            setUnreadCounts(prev => ({ ...prev, [email]: 0 }));
        } catch (e) {
            console.error('markRead error', e);
        }
        // immediately trigger suggestion (uses agentRef so always fresh)
        if (msgs.length > 0) {
            const latest = msgs[msgs.length - 1];
            lastSuggestedMsgIdRef.current = latest.id;
            // force=true: member just sent a message, always need a reply suggestion
            requestSuggestion(email, true);
        }
    }, [projectId, fetchMessages, requestSuggestion]);

    // ── initial load ──────────────────────────────────────────
    useEffect(() => {
        fetchProject();
        fetchUnread();
    }, [fetchProject, fetchUnread]);

    // ── poll every 4s for messages, unread counts, and project members ──
    useEffect(() => {
        pollRef.current = setInterval(() => {
            if (selectedEmail) fetchMessages(selectedEmail);
            fetchUnread(selectedEmail);
            fetchProject();
        }, 4000);
        return () => clearInterval(pollRef.current);
    }, [selectedEmail, fetchMessages, fetchUnread, fetchProject]);

    // ── scroll to bottom when messages change ─────────────────
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ── auto-suggest when a NEW message arrives via polling ──
    useEffect(() => {
        if (!agentRef.current?.geminiApiKey) return;
        if (!selectedEmail || messages.length === 0) return;
        const latest = messages[messages.length - 1];
        if (latest.id === lastSuggestedMsgIdRef.current) return;  // already handled
        lastSuggestedMsgIdRef.current = latest.id;
        // force=true: always produce a suggestion for any new message
        requestSuggestion(selectedEmail, true);
    }, [messages, selectedEmail, requestSuggestion]);

    // ── send message ──────────────────────────────────────────
    const handleSend = async () => {
        // Read HTML directly from the contentEditable div
        const html = editorRef.current?.innerHTML?.trim() ?? '';
        const text = editorRef.current?.innerText?.trim() ?? '';
        if (!html || !text || !selectedEmail || sending) return;
        setSending(true);
        try {
            await gqlClient.request(SEND_MESSAGE_MUTATION, {
                projectId,
                memberEmail: selectedEmail,
                content: html,   // store HTML
                sender: 'operator',
            });
            // clear editor
            if (editorRef.current) editorRef.current.innerHTML = '';
            setMessageInput('');
            setAgentState(null);
            lastSuggestedMsgIdRef.current = null;

            // Turn off typing indicator
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            gqlClient.request(UPDATE_OPERATOR_TYPING_MUTATION, { projectId, email: selectedEmail, isTyping: false });
            lastOperatorPingRef.current = 0;

            await fetchMessages(selectedEmail);
        } catch (e) {
            console.error('sendMessage error', e);
        } finally {
            setSending(false);
        }
    };

    // Sync agent suggestion into the editor when 'Use message' is clicked
    useEffect(() => {
        if (messageInput && editorRef.current) {
            // Only inject if the editor is empty (avoid overwriting user work)
            const currentText = editorRef.current.innerText?.trim();
            if (!currentText) {
                editorRef.current.innerHTML = messageInput;
                setMessageInput('');
                editorRef.current.focus();
                // Move cursor to end
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(editorRef.current);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }
    }, [messageInput]);

    const handleEditorInput = () => {
        const text = editorRef.current?.innerText?.trim() ?? '';
        const now = Date.now();
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        if (!text) {
            gqlClient.request(UPDATE_OPERATOR_TYPING_MUTATION, { projectId, email: selectedEmail, isTyping: false });
            lastOperatorPingRef.current = 0;
        } else {
            if (now - lastOperatorPingRef.current > 3000) {
                lastOperatorPingRef.current = now;
                gqlClient.request(UPDATE_OPERATOR_TYPING_MUTATION, { projectId, email: selectedEmail, isTyping: true });
            }
            typingTimeoutRef.current = setTimeout(() => {
                gqlClient.request(UPDATE_OPERATOR_TYPING_MUTATION, { projectId, email: selectedEmail, isTyping: false });
                lastOperatorPingRef.current = 0;
            }, 2000);
        }
    };

    const handleEditorKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
        if (e.key === 'Tab') {
            e.preventDefault();
            document.execCommand('insertText', false, '\u00a0\u00a0\u00a0\u00a0');
        }
    };

    const formatCmd = (cmd) => {
        document.execCommand(cmd, false, null);
        editorRef.current?.focus();
    };

    const insertBullet = () => {
        document.execCommand('insertUnorderedList', false, null);
        editorRef.current?.focus();
    };

    if (!project) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280' }}>
                Loading…
            </div>
        );
    }

    const activeMembers = (project.members || []).filter(m => !m.isRemoved);
    const removedMembers = (project.members || []).filter(m => m.isRemoved);

    // sort: unread first (descending count), then alphabetical
    const sortedActive = [...activeMembers].sort((a, b) => {
        const ua = unreadCounts[a.email] || 0;
        const ub = unreadCounts[b.email] || 0;
        if (ub !== ua) return ub - ua;
        return a.email.localeCompare(b.email);
    });

    // ── styles ────────────────────────────────────────────────
    const memberRowStyle = (email, removed = false) => ({
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        cursor: removed ? 'default' : 'pointer',
        borderLeft: selectedEmail === email ? '3px solid #3b82f6' : '3px solid transparent',
        backgroundColor: selectedEmail === email
            ? '#eff6ff'
            : (unreadCounts[email] && !removed)
                ? '#eff6ff88'
                : 'transparent',
        transition: 'background 0.15s',
        opacity: removed ? 0.5 : 1,
    });

    const activeSelectedMember = activeMembers.find(m => m.email === selectedEmail);
    const isSelectedMemberRemoved = (project.members || []).find(m => m.email === selectedEmail)?.isRemoved;
    const isTyping = activeSelectedMember?.typingUntil && new Date(activeSelectedMember.typingUntil + (activeSelectedMember.typingUntil.endsWith('Z') ? '' : 'Z')).getTime() > Date.now();

    return (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

            {/* ── Member sidebar ── */}
            <div style={{
                width: '300px',
                borderRight: '1px solid #e5e7eb',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#ffffff',
                flexShrink: 0,
                overflowY: 'auto',
            }}>
                {/* Project header */}
                <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid #f3f4f6' }}>
                    <button
                        onClick={onBack}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#6b7280', fontSize: '13px', marginBottom: '12px', padding: 0, cursor: 'pointer' }}
                    >
                        <ArrowLeft size={14} /> Back
                    </button>
                    <h2 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: '700', color: '#111827' }}>{project.title}</h2>
                    <p style={{ margin: 0, fontSize: '12px', color: '#6b7280', lineHeight: 1.4 }}>{project.description}</p>
                </div>

                {/* Active members */}
                <div style={{ flex: 1 }}>
                    {sortedActive.map(m => {
                        const unread = unreadCounts[m.email] || 0;
                        const online = isOnline(m.lastOnline);
                        return (
                            <div
                                key={m.email}
                                style={memberRowStyle(m.email)}
                                onClick={() => selectMember(m.email)}
                                onMouseEnter={e => { if (selectedEmail !== m.email) e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                                onMouseLeave={e => {
                                    if (selectedEmail !== m.email) {
                                        e.currentTarget.style.backgroundColor = unread ? '#eff6ff88' : 'transparent';
                                    }
                                }}
                            >
                                {/* Online dot */}
                                <div style={{
                                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                    backgroundColor: online ? '#22c55e' : '#d1d5db',
                                }} />
                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                    <div style={{
                                        fontSize: '13px',
                                        fontWeight: unread ? '700' : '500',
                                        color: unread ? '#1d4ed8' : '#111827',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    }}>
                                        {m.email}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                        <Clock size={10} color={online ? '#22c55e' : '#9ca3af'} />
                                        <span style={{ fontSize: '11px', color: online ? '#22c55e' : '#9ca3af' }}>{formatLastOnline(m.lastOnline)}</span>
                                    </div>
                                </div>
                                {unread > 0 && (
                                    <div style={{
                                        minWidth: '18px', height: '18px', borderRadius: '9px',
                                        backgroundColor: '#3b82f6', color: 'white',
                                        fontSize: '11px', fontWeight: '700',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        padding: '0 4px', flexShrink: 0,
                                    }}>
                                        {unread}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Removed members section */}
                {removedMembers.length > 0 && (
                    <div style={{ borderTop: '1px solid #f3f4f6' }}>
                        <button
                            onClick={() => setRemovedOpen(o => !o)}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                width: '100%', padding: '10px 16px', background: 'none', border: 'none',
                                fontSize: '12px', color: '#6b7280', fontWeight: '600', cursor: 'pointer',
                            }}
                        >
                            <span>Removed Chats ({removedMembers.length})</span>
                            {removedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                        {removedOpen && removedMembers.map(m => (
                            <div
                                key={m.email}
                                style={memberRowStyle(m.email, true)}
                                onClick={() => selectMember(m.email)}
                            >
                                <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: '#d1d5db' }} />
                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                    <div style={{ fontSize: '13px', fontWeight: '400', color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {m.email}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                        <Clock size={10} color="#d1d5db" />
                                        <span style={{ fontSize: '11px', color: '#d1d5db' }}>{formatLastOnline(m.lastOnline)}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Chat area ── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff', minWidth: 0 }}>
                {selectedEmail ? (
                    <>
                        {/* Messages list */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {messages.length === 0 ? (
                                <div style={{ margin: 'auto', color: '#9ca3af', fontSize: '14px' }}>
                                    Start chatting with {selectedEmail}.
                                </div>
                            ) : (
                                messages.map(msg => {
                                    const isOperator = msg.sender === 'operator';
                                    return (
                                        <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isOperator ? 'flex-end' : 'flex-start' }}>
                                            <div style={{
                                                maxWidth: '68%',
                                                padding: '10px 14px',
                                                borderRadius: isOperator ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                                                backgroundColor: isOperator ? '#3b82f6' : '#f3f4f6',
                                                color: isOperator ? '#ffffff' : '#111827',
                                                fontSize: '14px',
                                                lineHeight: 1.5,
                                                wordBreak: 'break-word',
                                            }}>
                                                {isOperator ? (
                                                    <span
                                                        className="msg-html"
                                                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.content) }}
                                                        style={{ display: 'block' }}
                                                    />
                                                ) : msg.content}
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                                                Sent {formatSentTime(msg.sentAt)}
                                            </div>
                                        </div>
                                    );
                                })
                            )}

                            {isTyping && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                    <style>
                                        {`
                                            @keyframes bounce {
                                                0%, 80%, 100% { transform: translateY(0); }
                                                40% { transform: translateY(-4px); }
                                            }
                                        `}
                                    </style>
                                    <div style={{
                                        padding: '12px 16px',
                                        borderRadius: '18px 18px 18px 4px',
                                        backgroundColor: '#f3f4f6',
                                        display: 'flex',
                                        gap: '4px',
                                        alignItems: 'center'
                                    }}>
                                        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#9ca3af', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '-0.32s' }} />
                                        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#9ca3af', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '-0.16s' }} />
                                        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#9ca3af', animation: 'bounce 1.4s infinite ease-in-out both' }} />
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                                        Typing...
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        {/* ── Agent Panel ── */}
                        {!isSelectedMemberRemoved && (
                            <AgentPanel
                                agent={agentFromApp}
                                agentState={agentState}
                                onSuggest={() => requestSuggestion(selectedEmail, true)}
                                onRedo={() => requestSuggestion(selectedEmail, true)}
                                onUse={(text) => setMessageInput(text)}
                                onManageAgent={onOpenAgent}
                            />
                        )}

                        {/* Message input */}
                        <div style={{
                            padding: '16px 24px',
                            borderTop: '1px solid #e5e7eb',
                            backgroundColor: '#ffffff',
                        }}>
                            {isSelectedMemberRemoved ? (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '12px',
                                    backgroundColor: '#f9fafb',
                                    borderRadius: '14px',
                                    color: '#9ca3af',
                                    fontSize: '14px',
                                    border: '1px solid #e5e7eb'
                                }}>
                                    This member has been removed so you can no longer send messages.
                                </div>
                            ) : (
                                <div style={{
                                    border: '1px solid #d1d5db',
                                    borderRadius: '14px',
                                    backgroundColor: '#f9fafb',
                                    overflow: 'hidden',
                                }}>
                                    {/* Formatting toolbar */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '2px',
                                        padding: '6px 10px',
                                        borderBottom: '1px solid #e5e7eb',
                                        backgroundColor: '#f3f4f6',
                                    }}>
                                        {[['bold', 'B', <Bold size={13} />], ['italic', 'I', <Italic size={13} />], ['underline', 'U', <Underline size={13} />]].map(([cmd, , icon]) => (
                                            <button key={cmd} onMouseDown={e => { e.preventDefault(); formatCmd(cmd); }}
                                                style={{ background: 'none', border: 'none', borderRadius: '5px', padding: '4px 6px', cursor: 'pointer', color: '#374151', display: 'flex', alignItems: 'center' }}
                                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e5e7eb'}
                                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                                title={cmd.charAt(0).toUpperCase() + cmd.slice(1)}
                                            >{icon}</button>
                                        ))}
                                        <div style={{ width: 1, height: 16, backgroundColor: '#d1d5db', margin: '0 4px' }} />
                                        <button onMouseDown={e => { e.preventDefault(); insertBullet(); }}
                                            style={{ background: 'none', border: 'none', borderRadius: '5px', padding: '4px 6px', cursor: 'pointer', color: '#374151', display: 'flex', alignItems: 'center' }}
                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e5e7eb'}
                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                            title="Bullet list"
                                        ><List size={13} /></button>
                                        <button onMouseDown={e => { e.preventDefault(); document.execCommand('insertText', false, '    '); editorRef.current?.focus(); }}
                                            style={{ background: 'none', border: 'none', borderRadius: '5px', padding: '4px 6px', cursor: 'pointer', color: '#374151', fontSize: '11px', fontWeight: '600' }}
                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e5e7eb'}
                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                            title="Tab indent"
                                        >⇥</button>
                                    </div>
                                    {/* Editor area */}
                                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', padding: '10px 14px' }}>
                                        <div
                                            ref={editorRef}
                                            contentEditable
                                            suppressContentEditableWarning
                                            onInput={handleEditorInput}
                                            onKeyDown={handleEditorKeyDown}
                                            onBlur={() => {
                                                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                                                if (selectedEmail) {
                                                    gqlClient.request(UPDATE_OPERATOR_TYPING_MUTATION, { projectId, email: selectedEmail, isTyping: false });
                                                    lastOperatorPingRef.current = 0;
                                                }
                                            }}
                                            data-placeholder="Type to write your message…"
                                            style={{
                                                flex: 1, minHeight: '22px', maxHeight: '120px',
                                                overflowY: 'auto', outline: 'none',
                                                fontSize: '14px', color: '#111827',
                                                fontFamily: 'inherit', lineHeight: 1.5,
                                                wordBreak: 'break-word',
                                            }}
                                        />
                                        <button
                                            onMouseDown={e => { e.preventDefault(); handleSend(); }}
                                            disabled={sending}
                                            style={{
                                                background: '#3b82f6',
                                                border: 'none', borderRadius: '50%',
                                                width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer', transition: 'background 0.15s', flexShrink: 0,
                                            }}
                                        >
                                            <Send size={14} color="white" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div style={{ margin: 'auto', color: '#9ca3af', fontSize: '14px', textAlign: 'center' }}>
                        Select a member to start chatting.
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── AgentPanel ───────────────────────────────────────────────

function AgentPanel({ agent, agentState, onSuggest, onRedo, onUse, onManageAgent }) {
    const hasKey = !!agent?.geminiApiKey;

    // No API key configured → show error frame
    if (!hasKey) {
        return (
            <div style={panelStyle('#f3f4f6', '#d1d5db')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                    <Sparkles size={16} color="#9ca3af" />
                    <span style={{ fontSize: '13px', fontStyle: 'italic', color: '#6b7280' }}>No agent available</span>
                </div>
                <AgentBtn onClick={onManageAgent} style={{ color: '#6b7280', borderColor: '#d1d5db' }}>
                    <Settings size={13} /> Manage Agent
                </AgentBtn>
            </div>
        );
    }

    // Loading
    if (agentState === 'loading') {
        return (
            <div style={panelStyle('#eef2ff', '#c7d2fe')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <SpinnerIcon />
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#4f46e5' }}>{agent.name}</span>
                    <span style={{ fontSize: '12px', color: '#818cf8' }}>Thinking…</span>
                </div>
            </div>
        );
    }

    // Has a suggestion
    if (agentState && agentState.suggestion) {
        return (
            <div style={{ ...panelStyle('#eef2ff', '#c7d2fe'), alignItems: 'flex-start', gap: '12px' }}>
                {/* Left: agent name + suggestion text */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Sparkles size={14} color="#4f46e5" style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#3730a3' }}>{agent.name}</span>
                    </div>
                    <div
                        style={{ fontSize: '13px', color: '#1e1b4b', lineHeight: 1.55 }}
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(agentState.suggestion) }}
                    />
                </div>
                {/* Right: action buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                    <AgentBtn onClick={onRedo}>
                        <RefreshCw size={12} /> Redo
                    </AgentBtn>
                    <AgentBtn
                        onClick={() => onUse(agentState.suggestion)}
                        style={{ backgroundColor: '#eef2ff', color: '#4f46e5', borderColor: '#c7d2fe', fontWeight: '700' }}
                    >
                        Use message
                    </AgentBtn>
                </div>
            </div>
        );
    }


    // No response needed
    if (agentState === 'no-response') {
        return (
            <div style={panelStyle('#eef2ff', '#c7d2fe')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                    <Sparkles size={15} color="#4f46e5" />
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#4f46e5' }}>{agent.name}</span>
                </div>
                <AgentBtn onClick={onSuggest}>
                    Suggest message
                </AgentBtn>
            </div>
        );
    }

    // Error state
    if (agentState && agentState.error) {
        return (
            <div style={panelStyle('#f3f4f6', '#d1d5db')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                    <Sparkles size={15} color="#9ca3af" />
                    <span style={{ fontSize: '12px', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Agent error — check your API key
                    </span>
                </div>
                <AgentBtn onClick={onManageAgent} style={{ color: '#6b7280', borderColor: '#d1d5db', flexShrink: 0 }}>
                    <Settings size={13} /> Manage Agent
                </AgentBtn>
            </div>
        );
    }

    // null / idle (no member selected yet, or after sending)
    return null;
}

function panelStyle(bg, border) {
    return {
        margin: '0 24px 12px',
        padding: '12px 16px',
        backgroundColor: bg,
        border: `1.5px solid ${border}`,
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
    };
}

function AgentBtn({ onClick, children, style = {} }) {
    return (
        <button
            onClick={onClick}
            style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '5px 12px', borderRadius: '8px',
                border: '1.5px solid #c7d2fe',
                background: 'none', fontSize: '12px', fontWeight: '500',
                color: '#4f46e5', cursor: 'pointer',
                whiteSpace: 'nowrap',
                ...style,
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
            {children}
        </button>
    );
}

function SpinnerIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation: 'agentSpin 0.8s linear infinite', flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" stroke="#c7d2fe" strokeWidth="3" />
            <path d="M12 2 A10 10 0 0 1 22 12" stroke="#4f46e5" strokeWidth="3" strokeLinecap="round" />
            <style>{`
        @keyframes agentSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        [contenteditable]:empty:before { content: attr(data-placeholder); color: #9ca3af; pointer-events: none; }
        .msg-html ul, .msg-html ol { margin: 4px 0 4px 18px; padding: 0; }
        .msg-html li { margin: 2px 0; }
        .msg-html p { margin: 0 0 4px; }
        .msg-html b, .msg-html strong { font-weight: 700; }
        .msg-html em, .msg-html i { font-style: italic; }
        .msg-html u { text-decoration: underline; }
      `}</style>
        </svg>
    );
}

export default ProjectPage;

