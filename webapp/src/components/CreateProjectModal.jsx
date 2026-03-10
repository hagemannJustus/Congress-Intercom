import React, { useState, useRef, useEffect } from 'react';
import { X, Upload } from 'lucide-react';

let BACKEND_URL = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:8000/graphql';
if (BACKEND_URL && !BACKEND_URL.startsWith('http')) {
    BACKEND_URL = `https://${BACKEND_URL}/graphql`;
}
const UPLOAD_URL = BACKEND_URL.replace('/graphql', '/upload');

/**
 * CreateProjectModal
 *
 * Props:
 *  - isOpen: bool
 *  - onClose: () => void
 *  - onCreate: (projectData) => Promise  — called when creating a brand-new project
 *  - editProject: { id, title, pictureUrl, description, members? } | null
 *      When truthy the modal opens in "edit" mode with pre-filled fields.
 *  - onUpdate: (id, projectData) => Promise  — called when saving an edited project
 */
const CreateProjectModal = ({ isOpen, onClose, onCreate, editProject = null, onUpdate }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [picture, setPicture] = useState(null);          // File object (new upload)
    const [picturePreview, setPicturePreview] = useState(null);
    const [membersInput, setMembersInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef(null);

    const isEditMode = !!editProject;

    // Populate fields when switching between create / edit
    useEffect(() => {
        if (isOpen && isEditMode) {
            setTitle(editProject.title || '');
            setDescription(editProject.description || '');
            setPicture(null);
            setPicturePreview(editProject.pictureUrl || null);
            const emails = (editProject.members || [])
                .filter(m => !m.isRemoved)
                .map(m => (typeof m === 'string' ? m : m.email))
                .join(', ');
            setMembersInput(emails);
        } else if (isOpen && !isEditMode) {
            resetForm();
        }
    }, [isOpen, editProject]);

    const resetForm = () => {
        setTitle('');
        setDescription('');
        setPicture(null);
        setPicturePreview(null);
        setMembersInput('');
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    if (!isOpen) return null;

    const handleFileChange = (file) => {
        if (!file) return;
        if (!['image/jpeg', 'image/png'].includes(file.type)) {
            alert('Please upload a JPEG or PNG image.');
            return;
        }
        if (file.size > 100 * 1024 * 1024) {
            alert('File is too large. Max size is 100MB.');
            return;
        }
        setPicture(file);
        const reader = new FileReader();
        reader.onloadend = () => setPicturePreview(reader.result);
        reader.readAsDataURL(file);
    };

    const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const onDragLeave = () => setIsDragging(false);
    const onDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFileChange(e.dataTransfer.files[0]);
    };

    const parsedEmails = () =>
        membersInput
            .split(/[,\n]/)
            .map(e => e.trim())
            .filter(e => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

    const handleSubmit = async (e) => {
        e.preventDefault();

        const memberEmails = parsedEmails();
        if (memberEmails.length === 0) {
            alert('Please add at least one valid member email.');
            return;
        }

        setLoading(true);
        try {
            let finalPictureUrl = isEditMode ? editProject.pictureUrl : null;

            // Upload a new picture only if the user chose one
            if (picture) {
                const formData = new FormData();
                formData.append('file', picture);
                const uploadResponse = await fetch(UPLOAD_URL, {
                    method: 'POST',
                    body: formData,
                });
                const uploadData = await uploadResponse.json();
                finalPictureUrl = uploadData.url;
            }

            if (!finalPictureUrl) {
                alert('Please upload a project picture.');
                setLoading(false);
                return;
            }

            const payload = {
                title,
                pictureUrl: finalPictureUrl,
                description,
                memberEmails,
            };

            if (isEditMode) {
                await onUpdate(editProject.id, payload);
            } else {
                await onCreate(payload);
            }

            resetForm();
            onClose();
        } catch (error) {
            console.error('Failed to save project:', error);
            alert('Error saving project. Check console.');
        } finally {
            setLoading(false);
        }
    };

    const memberEmailsCount = parsedEmails().length;
    const hasPicture = picture !== null || (isEditMode && !!editProject.pictureUrl);

    const isFormValid =
        title.trim().length > 0 &&
        description.trim().length > 0 &&
        hasPicture &&
        memberEmailsCount > 0;

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h2 style={{ margin: 0, fontSize: '20px' }}>
                        {isEditMode ? 'Edit project' : 'Create new project'}
                    </h2>
                    <button onClick={handleClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}>
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Title */}
                    <div className="form-group">
                        <label>Project Title</label>
                        <input
                            type="text"
                            maxLength={100}
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Enter project name"
                            required
                        />
                    </div>

                    {/* Picture */}
                    <div className="form-group">
                        <label>Project Picture</label>
                        <div
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                            onDrop={onDrop}
                            onClick={() => fileInputRef.current.click()}
                            style={{
                                border: '2px dashed #e5e7eb',
                                borderRadius: '12px',
                                padding: '40px 20px',
                                textAlign: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                backgroundColor: isDragging ? '#f0f7ff' : '#f9fafb',
                                borderColor: isDragging ? '#3b82f6' : '#e5e7eb',
                                position: 'relative',
                                overflow: 'hidden',
                                minHeight: '160px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            {picturePreview ? (
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white' }}>
                                    <img src={picturePreview} alt="Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                    <div style={{ position: 'absolute', bottom: '10px', right: '10px', background: 'rgba(0,0,0,0.5)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                                        Change Image
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px', color: '#3b82f6' }}>
                                        <Upload size={24} />
                                    </div>
                                    <div style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>Click to upload or drag and drop</div>
                                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>PNG or JPG (max. 100MB)</div>
                                </>
                            )}
                        </div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={(e) => handleFileChange(e.target.files[0])}
                            accept="image/png, image/jpeg"
                            style={{ display: 'none' }}
                        />
                    </div>

                    {/* Description */}
                    <div className="form-group">
                        <label>Description</label>
                        <textarea
                            maxLength={1000}
                            rows={3}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What is this project about?"
                            required
                        />
                    </div>

                    {/* Members */}
                    <div className="form-group">
                        <label>Members (paste email addresses)</label>
                        <textarea
                            rows={3}
                            value={membersInput}
                            onChange={(e) => setMembersInput(e.target.value)}
                            placeholder="john@example.com, sara@example.com"
                            required
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
                        <button type="button" className="btn-secondary" onClick={handleClose}>Cancel</button>
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={!isFormValid || loading}
                            style={{
                                opacity: (!isFormValid || loading) ? 0.5 : 1,
                                cursor: (!isFormValid || loading) ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {loading ? (isEditMode ? 'Saving...' : 'Creating...') : (isEditMode ? 'Save' : 'Create Project')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateProjectModal;
