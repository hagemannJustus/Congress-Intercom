import React, { useState, useEffect, useRef } from 'react';
import { Plus, Phone, Menu, User, FileText, MoreVertical, Trash2, RefreshCw, Pencil, Bot } from 'lucide-react';
import CreateProjectModal from './components/CreateProjectModal';
import ManageAgentModal from './components/ManageAgentModal';
import ProjectPage from './components/ProjectPage';
import { request, gql, GraphQLClient } from 'graphql-request';

let BACKEND_URL = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:8000/graphql';
if (BACKEND_URL && !BACKEND_URL.startsWith('http')) {
  BACKEND_URL = `https://${BACKEND_URL}/graphql`;
}

const gqlClient = new GraphQLClient(BACKEND_URL, {
  headers: {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache'
  }
});

const GET_PROJECTS_QUERY = gql`
  query GetProjects {
    projects {
      id
      title
      pictureUrl
      description
      members {
        email
        isRemoved
      }
      unreadCount
      agent {
        id
        projectId
        name
        soul
        geminiApiKey
      }
    }
  }
`;

const CREATE_PROJECT_MUTATION = gql`
  mutation CreateProject($title: String!, $pictureUrl: String!, $description: String!, $memberEmails: [String!]!) {
    createProject(title: $title, pictureUrl: $pictureUrl, description: $description, memberEmails: $memberEmails) {
      id
      title
      pictureUrl
      description
    }
  }
`;

const DELETE_PROJECT_MUTATION = gql`
  mutation DeleteProject($id: Int!) {
    deleteProject(id: $id)
  }
`;

const UPDATE_PROJECT_MUTATION = gql`
  mutation UpdateProject($id: Int!, $title: String!, $pictureUrl: String!, $description: String!, $memberEmails: [String!]!) {
    updateProject(id: $id, title: $title, pictureUrl: $pictureUrl, description: $description, memberEmails: $memberEmails) {
      id
      title
      pictureUrl
      description
    }
  }
`;

const UPSERT_AGENT_MUTATION = gql`
  mutation UpsertAgent($projectId: Int!, $name: String!, $soul: String!, $geminiApiKey: String) {
    upsertAgent(projectId: $projectId, name: $name, soul: $soul, geminiApiKey: $geminiApiKey) {
      id
      projectId
      name
      soul
      geminiApiKey
    }
  }
`;

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editProject, setEditProject] = useState(null); // project being edited, or null for create
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const menuRef = useRef(null);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const hoverTimeoutRef = useRef(null);
  const [agentProject, setAgentProject] = useState(null); // project whose agent modal is open

  const isCollapsed = !!selectedProjectId && !sidebarHovered;

  // Pull to refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const mainRef = useRef(null);
  const startY = useRef(null);
  const isRefreshingRef = useRef(false);

  const fetchProjects = async () => {
    try {
      const data = await gqlClient.request(GET_PROJECTS_QUERY);
      setProjects(data.projects || []);
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  useEffect(() => {
    fetchProjects();
    const intervalId = setInterval(() => {
      fetchProjects();
    }, 4000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.dropdown-menu-container') && !event.target.closest('.menu-btn')) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const triggerRefresh = async () => {
    if (isRefreshingRef.current) return;
    setIsRefreshing(true);
    isRefreshingRef.current = true;
    setPullProgress(60);
    await fetchProjects();
    await new Promise(r => setTimeout(r, 600)); // artificial delay for animation
    setIsRefreshing(false);
    isRefreshingRef.current = false;
    setPullProgress(0);
  };

  const handleTouchStart = (e) => {
    if (mainRef.current && mainRef.current.scrollTop <= 0) {
      startY.current = e.touches ? e.touches[0].clientY : e.clientY;
    }
  };

  const handleTouchMove = (e) => {
    if (startY.current !== null && mainRef.current && mainRef.current.scrollTop <= 0) {
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      const delta = y - startY.current;
      if (delta > 0) {
        setPullProgress(Math.min(delta, 100));
      }
    }
  };

  const handleTouchEnd = () => {
    if (pullProgress > 60 && !isRefreshingRef.current) {
      triggerRefresh();
    } else if (!isRefreshingRef.current) {
      setPullProgress(0);
    }
    startY.current = null;
  };

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setSidebarHovered(true);
    }, 500);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setSidebarHovered(false);
  };

  const handleWheel = (e) => {
    if (mainRef.current && mainRef.current.scrollTop <= 0 && e.deltaY < 0 && !isRefreshingRef.current) {
      setPullProgress(prev => {
        const next = prev + Math.abs(e.deltaY) * 0.5;
        if (next > 60) {
          triggerRefresh();
          return 0;
        }
        clearTimeout(mainRef.current.wheelTimeout);
        mainRef.current.wheelTimeout = setTimeout(() => {
          if (!isRefreshingRef.current) setPullProgress(0);
        }, 150);
        return Math.min(next, 100);
      });
    }
  };

  const handleCreateProject = async (projectData) => {
    try {
      await gqlClient.request(CREATE_PROJECT_MUTATION, projectData);
      setIsModalOpen(false);
      setEditProject(null);
      await fetchProjects();
    } catch (error) {
      console.error('GraphQL Error:', error);
      throw error;
    }
  };

  const handleDeleteProject = async (id) => {
    try {
      await gqlClient.request(DELETE_PROJECT_MUTATION, { id: parseInt(id) });
      console.log('Project deleted successfully');
      setActiveMenuId(null);
      await fetchProjects();
    } catch (error) {
      console.error('GraphQL Error:', error);
    }
  };

  const handleEditProject = (project) => {
    setEditProject(project);
    setActiveMenuId(null);
    setIsModalOpen(true);
  };

  const handleUpdateProject = async (id, projectData) => {
    try {
      await gqlClient.request(UPDATE_PROJECT_MUTATION, { id: parseInt(id), ...projectData });
      setIsModalOpen(false);
      setEditProject(null);
      await fetchProjects();
    } catch (error) {
      console.error('GraphQL Error on update:', error);
      throw error;
    }
  };

  const handleOpenAgent = (project) => {
    setAgentProject(project);
    setActiveMenuId(null);
  };

  const handleSaveAgent = async ({ projectId, name, soul, geminiApiKey }) => {
    await gqlClient.request(UPSERT_AGENT_MUTATION, {
      projectId: parseInt(projectId),
      name,
      soul,
      geminiApiKey: geminiApiKey || null,
    });
    await fetchProjects();
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', backgroundColor: '#ffffff' }}>
      {/* Sidebar */}
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          width: isCollapsed ? '60px' : '260px',
          minWidth: isCollapsed ? '60px' : '260px',
          borderRight: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px 0',
          backgroundColor: '#f9fafb',
          position: 'relative',
          transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          overflow: 'hidden',
          zIndex: 20,
        }}
      >
        <div style={{ padding: '0 20px', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '12px', whiteSpace: 'nowrap' }}>
          <Menu size={20} style={{ flexShrink: 0 }} />
          <span style={{
            fontWeight: '600',
            fontSize: '18px',
            opacity: isCollapsed ? 0 : 1,
            transition: 'opacity 0.2s ease, visibility 0.2s',
            visibility: isCollapsed ? 'hidden' : 'visible'
          }}>
            Workflow <span style={{ color: '#6b7280', fontWeight: '400' }}>ChatDesk</span>
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '0 22px', marginBottom: '16px', whiteSpace: 'nowrap', height: '14px' }}>
            <span style={{
              fontSize: '11px',
              fontWeight: '700',
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              opacity: isCollapsed ? 0 : 1,
              transition: 'opacity 0.2s ease, visibility 0.2s',
              visibility: isCollapsed ? 'hidden' : 'visible'
            }}>
              Projects
            </span>
          </div>

          <div style={{ marginBottom: '8px' }}>
            {projects.map(p => (
              <div
                key={p.id}
                className="sidebar-item"
                onClick={() => setSelectedProjectId(p.id)}
                style={{
                  padding: '8px 22px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '14px',
                  color: '#4b5563',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background 0.2s ease',
                  backgroundColor: selectedProjectId === p.id ? '#e0e7ff' : (activeMenuId === p.id ? '#f3f4f6' : 'transparent')
                }}
                onMouseEnter={e => {
                  if (selectedProjectId !== p.id && activeMenuId !== p.id) e.currentTarget.style.backgroundColor = '#f3f4f6';
                  const menuBtn = e.currentTarget.querySelector('.menu-btn');
                  if (menuBtn) menuBtn.style.opacity = '1';
                }}
                onMouseLeave={e => {
                  if (selectedProjectId !== p.id && activeMenuId !== p.id) e.currentTarget.style.backgroundColor = 'transparent';
                  const menuBtn = e.currentTarget.querySelector('.menu-btn');
                  if (menuBtn && activeMenuId !== p.id) menuBtn.style.opacity = '0';
                }}
              >
                <FileText size={16} strokeWidth={2} style={{ flexShrink: 0 }} />
                <span title={p.title} style={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  flex: 1,
                  opacity: isCollapsed ? 0 : 1,
                  transition: 'opacity 0.2s ease, visibility 0.2s, max-width 0.3s ease',
                  visibility: isCollapsed ? 'hidden' : 'visible',
                  maxWidth: isCollapsed ? '0' : '200px'
                }}>
                  {p.title}
                </span>
                {p.unreadCount > 0 && (
                  <div style={{
                    backgroundColor: '#ef4444',
                    color: '#ffffff',
                    fontWeight: '700',
                    fontSize: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '18px',
                    height: '18px',
                    borderRadius: '9px',
                    padding: '0 4px',
                    flexShrink: 0,
                    position: isCollapsed ? 'absolute' : 'relative',
                    top: isCollapsed ? '6px' : 'auto',
                    right: isCollapsed ? '10px' : 'auto',
                    transition: 'all 0.3s ease',
                    zIndex: 5
                  }}>
                    {p.unreadCount}
                  </div>
                )}

                <button
                  className="menu-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMenuId(activeMenuId === p.id ? null : p.id);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '4px',
                    borderRadius: '4px',
                    color: '#9ca3af',
                    opacity: activeMenuId === p.id ? '1' : '0',
                    transition: 'opacity 0.2s, background 0.2s, visibility 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    visibility: isCollapsed ? 'hidden' : 'visible'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e5e7eb'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <MoreVertical size={14} />
                </button>

                {!isCollapsed && activeMenuId === p.id && (
                  <div
                    className="dropdown-menu-container"
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: 'calc(100% - 4px)',
                      backgroundColor: 'white',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      border: '1px solid #e5e7eb',
                      zIndex: 100,
                      minWidth: '120px',
                      padding: '4px'
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleEditProject(p);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                        padding: '8px 12px',
                        fontSize: '13px',
                        color: '#374151',
                        background: 'none',
                        border: 'none',
                        borderRadius: '6px',
                        textAlign: 'left',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <Pencil size={14} />
                      Edit
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleOpenAgent(p);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                        padding: '8px 12px',
                        fontSize: '13px',
                        color: '#374151',
                        background: 'none',
                        border: 'none',
                        borderRadius: '6px',
                        textAlign: 'left',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f0ff'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <Bot size={14} color="#6366f1" />
                      Manage agent
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteProject(p.id);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                        padding: '8px 12px',
                        fontSize: '13px',
                        color: '#ef4444',
                        background: 'none',
                        border: 'none',
                        borderRadius: '6px',
                        textAlign: 'left',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fef2f2'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 22px',
              width: '100%',
              background: 'none',
              border: 'none',
              color: '#3b82f6',
              fontSize: '14px',
              fontWeight: '500',
              textAlign: 'left',
              whiteSpace: 'nowrap',
              justifyContent: 'flex-start',
            }}
          >
            <Plus size={18} style={{ flexShrink: 0 }} />
            <span style={{
              opacity: isCollapsed ? 0 : 1,
              transition: 'opacity 0.2s ease, visibility 0.2s',
              visibility: isCollapsed ? 'hidden' : 'visible'
            }}>
              Create new project
            </span>
          </button>
        </div>

        <button style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'none',
          border: 'none',
          color: '#6b7280',
          fontSize: '13px',
          padding: '8px 22px',
          whiteSpace: 'nowrap',
          justifyContent: 'flex-start',
          width: '100%'
        }}>
          <Phone size={16} style={{ flexShrink: 0 }} />
          <span style={{
            opacity: isCollapsed ? 0 : 1,
            transition: 'opacity 0.2s ease, visibility 0.2s',
            visibility: isCollapsed ? 'hidden' : 'visible'
          }}>
            Contact Support
          </span>
        </button>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff', position: 'relative' }}>
        <style>
          {`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            .spinning {
              animation: spin 1s linear infinite;
            }
          `}
        </style>

        {selectedProjectId ? (
          <ProjectPage
            projectId={selectedProjectId}
            project={projects.find(p => p.id === selectedProjectId) || null}
            onBack={() => setSelectedProjectId(null)}
            onOpenAgent={() => {
              const p = projects.find(pr => pr.id === selectedProjectId);
              if (p) setAgentProject(p);
            }}
          />
        ) : (
          <>
            {/* Pull to refresh indicator */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: `${pullProgress}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              backgroundColor: '#f9fafb',
              transition: isRefreshing ? 'height 0.3s ease' : 'none',
              zIndex: 10
            }}>
              {(pullProgress > 0 || isRefreshing) && (
                <div style={{
                  transform: isRefreshing ? 'none' : `rotate(${pullProgress * 3}deg)`,
                  color: '#3b82f6',
                  opacity: Math.min(pullProgress / 60, 1)
                }} className={isRefreshing ? 'spinning' : ''}>
                  <RefreshCw size={24} />
                </div>
              )}
            </div>

            <main
              ref={mainRef}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onWheel={handleWheel}
              style={{
                padding: '40px 60px',
                flex: 1,
                overflowY: 'auto',
                transform: `translateY(${!isRefreshing ? pullProgress : 60}px)`,
                transition: (!isRefreshing && pullProgress === 0) || isRefreshing ? 'transform 0.3s ease' : 'none'
              }}
            >
              <h1 style={{ fontSize: '28px', fontWeight: '500', margin: '0 0 8px 0', color: '#111827' }}>Welcome</h1>
              <p style={{ color: '#6b7280', marginBottom: '40px', fontSize: '15px' }}>This is your Workflow ChatDesk. Manage all open chats.</p>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '24px'
              }}>
                {/* Create Project Card */}
                <div style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '16px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: '#ffffff',
                  minHeight: '160px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: 'auto' }}>
                    <div style={{ width: '40px', height: '40px', backgroundColor: '#111827', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Plus color="white" size={24} />
                    </div>
                    <span style={{ fontWeight: '600', color: '#111827' }}>New Project</span>
                  </div>

                  <button
                    onClick={() => setIsModalOpen(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'none',
                      border: 'none',
                      color: '#3b82f6',
                      fontSize: '14px',
                      fontWeight: '500',
                      padding: '8px 0 0 0',
                      marginTop: '16px'
                    }}
                  >
                    <Plus size={16} />
                    Create new project
                  </button>
                </div>

                {projects.map(p => (
                  <div
                    key={p.id}
                    className="project-card"
                    onClick={() => setSelectedProjectId(p.id)}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      padding: '24px',
                      display: 'flex',
                      flexDirection: 'column',
                      backgroundColor: '#ffffff',
                      minHeight: '160px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                      cursor: 'pointer',
                      transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 12px 20px -10px rgba(0,0,0,0.1)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '20%', overflow: 'hidden', backgroundColor: '#f3f4f6', flexShrink: 0 }}>
                        <img src={p.pictureUrl} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <span style={{ fontWeight: '600', color: '#111827', fontSize: '15px', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</span>
                      {p.unreadCount > 0 && (
                        <div style={{
                          backgroundColor: '#ef4444',
                          color: '#ffffff',
                          fontWeight: '700',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: '22px',
                          height: '22px',
                          borderRadius: '11px',
                          padding: '0 6px',
                          flexShrink: 0,
                          boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)'
                        }}>
                          {p.unreadCount}
                        </div>
                      )}
                    </div>
                    <p style={{
                      color: '#6b7280',
                      fontSize: '14px',
                      margin: 0,
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      lineHeight: '1.5'
                    }}>
                      {p.description || 'No description provided.'}
                    </p>
                  </div>
                ))}
              </div>
            </main>
          </>
        )}
      </div>

      <CreateProjectModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditProject(null); }}
        onCreate={handleCreateProject}
        editProject={editProject}
        onUpdate={handleUpdateProject}
      />
      <ManageAgentModal
        isOpen={!!agentProject}
        onClose={() => setAgentProject(null)}
        project={agentProject}
        onSave={handleSaveAgent}
      />
    </div >
  );
}

export default App;
