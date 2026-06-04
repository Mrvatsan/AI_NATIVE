import { useState, useEffect } from 'react';
import './index.css';

const SUGGESTIONS = [
  { 
    title: "E-Commerce with Stripe", 
    desc: "Online store with cart page, product schema, and checkout stubs.", 
    prompt: "Build an e-commerce platform with products, categories, cart, and stripe payments. Needs customer and merchant roles, checkout actions, and email notification on successful payment." 
  },
  { 
    title: "SaaS CRM Platform", 
    desc: "Customer management with user roles and third-party sync stubs.", 
    prompt: "Create a SaaS CRM with contact tracking, sales pipeline pages, and team roles. Add integration with Salesforce to sync accounts, and a slack notification trigger when a deal is closed." 
  },
  { 
    title: "IT Ticket Helpdesk", 
    desc: "Support ticket portal with auto-repair validation rules.", 
    prompt: "Design an IT ticketing portal with tickets, comments, and priority fields. Customers can read/write their own tickets, agents can update status. Include Jira sync triggers." 
  }
];

const STAGES = [
  { key: 'IntentExtraction', label: 'Intent Extraction', desc: 'Parsing natural language into structured app requirements.', fallbackModel: 'Groq / Llama 3.1 8b' },
  { key: 'SchemaGeneration', label: 'Schema Generation', desc: 'Generating database models, schemas, and authorization rules.', fallbackModel: 'Gemini / Gemini 2.5 Flash' },
  { key: 'AppSpecGeneration', label: 'AppSpec Generation', desc: 'Compiling pages, API endpoints, and integration workflow stubs.', fallbackModel: 'OpenAI / GPT-4o-mini' }
];

const STAGE_COST_KEYS: Record<string, string> = {
  'IntentExtraction': 'intentExtraction',
  'SchemaGeneration': 'schemaGeneration',
  'AppSpecGeneration': 'appSpecGeneration'
};

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function App() {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  
  const [events, setEvents] = useState<any[]>([]);
  const [appSpec, setAppSpec] = useState<any>(null);
  const [costBreakdown, setCostBreakdown] = useState<any>(null);
  const [integrations, setIntegrations] = useState<any[]>([]);
  
  // Navigation & Tabs state
  const [activeTab, setActiveTab] = useState<'compiler' | 'integrations'>('compiler');
  const [activeSpecTab, setActiveSpecTab] = useState<'overview' | 'pages' | 'endpoints' | 'auth' | 'workflows' | 'json'>('overview');
  const [copied, setCopied] = useState(false);
  const [expandedErrorIndex, setExpandedErrorIndex] = useState<number | null>(0);
  
  // Live Timer State
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    fetch(`${API_URL}/api/integrations`)
      .then(res => res.json())
      .then(data => setIntegrations(data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    let interval: any;
    if (isGenerating) {
      const startTime = Date.now();
      interval = setInterval(() => {
        setElapsedTime(Math.round((Date.now() - startTime) / 100) / 10);
      }, 100);
    } else {
      setElapsedTime(0);
    }
    return () => clearInterval(interval);
  }, [isGenerating]);

  useEffect(() => {
    if (!jobId) return;

    const sse = new EventSource(`${API_URL}/api/generate/${jobId}/stream`);
    
    sse.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setEvents(prev => [...prev, data]);
      
      if (data.event === 'generation_complete') {
        setIsGenerating(false);
        setAppSpec(data.finalSpec);
        sse.close();
        
        // Fetch cost
        fetch(`${API_URL}/api/generate/${jobId}`)
          .then(res => res.json())
          .then(data => setCostBreakdown(data.costBreakdown))
          .catch(console.error);
      } else if (data.event === 'generation_failed') {
        setIsGenerating(false);
        sse.close();
      }
    };

    return () => sse.close();
  }, [jobId]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setEvents([]);
    setAppSpec(null);
    setCostBreakdown(null);
    try {
      const res = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      setJobId(data.jobId);
    } catch (e) {
      console.error(e);
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(appSpec, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const errors = events.filter(e => e.event === 'stage_failed' && e.repairLog);

  // Helper to parse stage states
  const getStageState = (stageKey: string) => {
    const startEvent = events.find(e => e.stage === stageKey && e.event === 'stage_start');
    const completeEvent = events.find(e => e.stage === stageKey && e.event === 'stage_complete');
    const failedEvent = events.find(e => e.stage === stageKey && e.event === 'stage_failed');

    if (completeEvent) {
      return { status: 'completed', latency: completeEvent.latency, data: completeEvent.data };
    }
    if (failedEvent) {
      return { status: 'failed', repairLog: failedEvent.repairLog };
    }
    if (startEvent) {
      return { status: 'running' };
    }
    return { status: 'pending' };
  };

  // Cumulative cost calculations
  let totalCost = 0;
  let totalTokens = 0;
  if (costBreakdown) {
    Object.values(costBreakdown).forEach((cost: any) => {
      totalCost += cost.estimatedCost || 0;
      totalTokens += cost.totalTokens || 0;
    });
  }

  return (
    <div className="app-container">
      {/* Sidebar navigation */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{color: '#fff'}}>
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
          <span className="logo-text">AI_NATIVE</span>
        </div>
        
        <nav className="sidebar-nav">
          <button 
            className={`nav-item ${activeTab === 'compiler' ? 'active' : ''}`}
            onClick={() => setActiveTab('compiler')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            Compiler Dashboard
          </button>
          
          <button 
            className={`nav-item ${activeTab === 'integrations' ? 'active' : ''}`}
            onClick={() => setActiveTab('integrations')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="9" rx="1" />
              <rect x="14" y="3" width="7" height="5" rx="1" />
              <rect x="14" y="12" width="7" height="9" rx="1" />
              <rect x="3" y="16" width="7" height="5" rx="1" />
            </svg>
            Integration Registry
          </button>
        </nav>
        
        <div className="sidebar-footer">
          <div className="system-status">
            <span className={`status-dot ${isGenerating ? 'active' : ''}`} />
            {isGenerating ? 'Compiling active job...' : 'Systems Operational'}
          </div>
        </div>
      </aside>

      {/* Main Panel Content */}
      <main className="main-content">
        <header className="workspace-header">
          <div className="workspace-title">
            <h1>{activeTab === 'compiler' ? 'App Spec Compiler' : 'Integration Registry'}</h1>
          </div>
          {jobId && activeTab === 'compiler' && (
            <div className="workspace-actions">
              <span className="badge badge-gray" style={{fontFamily: 'monospace'}}>Job ID: {jobId.substring(0, 8)}...</span>
            </div>
          )}
        </header>

        <div className="workspace-scrollable">
          {activeTab === 'compiler' ? (
            <>
              {/* Prompt Input Area */}
              <div className={`prompt-area ${!isGenerating && !appSpec ? 'centered' : 'docked'}`}>
                {!isGenerating && !appSpec && (
                  <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                    <h2 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '8px', background: 'linear-gradient(to right, #ffffff, #a855f7, #6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                      Compile Natural Language into Code
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                      Enter your feature requirements. Our multi-stage self-healing compiler generates complete schemas, pages, API stubs, and integrations.
                    </p>
                  </div>
                )}

                <div className="prompt-card">
                  <div className="prompt-textarea-wrapper">
                    <textarea 
                      className="prompt-textarea"
                      value={prompt} 
                      onChange={e => setPrompt(e.target.value)} 
                      placeholder="Describe the application you want to build (e.g. An asset manager with checkout history, admin dashboard, and Slack approval webhooks)..."
                      disabled={isGenerating}
                    />
                  </div>
                  <div className="prompt-card-actions">
                    <div className="prompt-info">
                      {isGenerating ? (
                        <span style={{color: 'var(--accent-indigo)', display: 'flex', alignItems: 'center', gap: '8px'}}>
                          <span className="pulse-spinner" /> Running multi-provider build pipeline...
                        </span>
                      ) : (
                        <span>Ready to compile</span>
                      )}
                    </div>
                    <button 
                      className="btn-generate" 
                      onClick={handleGenerate} 
                      disabled={!prompt.trim() || isGenerating}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                      </svg>
                      {isGenerating ? 'Compiling Spec...' : 'Compile Specification'}
                    </button>
                  </div>
                </div>

                {!isGenerating && !appSpec && (
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>Or start with an example:</div>
                    <div className="suggestions-grid">
                      {SUGGESTIONS.map((s, idx) => (
                        <button 
                          key={idx} 
                          className="suggestion-pill"
                          onClick={() => setPrompt(s.prompt)}
                        >
                          <div className="suggestion-title">{s.title}</div>
                          <div className="suggestion-desc">{s.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Running / Completed Pipeline Area */}
              {(isGenerating || events.length > 0) && (
                <div className="pipeline-layout">
                  {/* Left Column: Progress Stepper & Cost */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="card">
                      <div className="card-title">
                        <span>Compiler Pipeline</span>
                        {isGenerating && (
                          <span className="badge badge-indigo animate-pulse">{elapsedTime.toFixed(1)}s</span>
                        )}
                      </div>
                      
                      <div className="timeline-stepper">
                        {STAGES.map((stage) => {
                          const state = getStageState(stage.key);
                          const isCostAvail = costBreakdown && costBreakdown[STAGE_COST_KEYS[stage.key]];
                          const costData = isCostAvail ? costBreakdown[STAGE_COST_KEYS[stage.key]] : null;

                          return (
                            <div key={stage.key} className={`stepper-item ${state.status}`}>
                              <div className="stepper-node">
                                {state.status === 'completed' && (
                                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                                {state.status === 'running' && <span className="pulse-spinner" style={{width: '8px', height: '8px', border: '1.5px solid white', borderTopColor: 'transparent'}} />}
                                {state.status === 'failed' && <span style={{color: 'white', fontSize: '9px', fontWeight: 'bold'}}>!</span>}
                              </div>
                              <div className="stepper-content">
                                <div className="stepper-header">
                                  <span className="stepper-title">{stage.label}</span>
                                  {state.status === 'completed' && (
                                    <span className="badge badge-emerald">{state.latency ? `${state.latency}ms` : 'done'}</span>
                                  )}
                                  {state.status === 'running' && (
                                    <span className="badge badge-indigo animate-pulse">active</span>
                                  )}
                                  {state.status === 'failed' && (
                                    <span className="badge badge-rose">failed</span>
                                  )}
                                  {state.status === 'pending' && (
                                    <span className="badge badge-gray">queued</span>
                                  )}
                                </div>
                                <div className="stepper-desc">{stage.desc}</div>
                                
                                <div className="stepper-meta">
                                  <span className="badge badge-gray" style={{fontSize: '0.7rem', opacity: 0.8}}>
                                    {costData ? `${costData.provider} / ${costData.model}` : stage.fallbackModel}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Cumulative stats card */}
                      <div className="stats-card">
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Telemetry & Costs</div>
                        <div className="stats-grid">
                          <div className="stat-box">
                            <div className="stat-label">Total Est. Cost</div>
                            <div className="stat-val" style={{color: 'var(--accent-emerald)'}}>
                              ${totalCost > 0 ? totalCost.toFixed(5) : '0.00000'}
                            </div>
                          </div>
                          <div className="stat-box">
                            <div className="stat-label">Tokens Used</div>
                            <div className="stat-val">
                              {totalTokens > 0 ? totalTokens.toLocaleString() : '0'}
                            </div>
                          </div>
                        </div>

                        {costBreakdown && (
                          <div className="cost-breakdown-list">
                            {Object.entries(costBreakdown).map(([stage, cost]: [string, any]) => (
                              <div key={stage} className="cost-breakdown-item">
                                <span style={{textTransform: 'capitalize'}}>{stage.replace('Generation', ' Gen').replace('Extraction', ' Extract')}</span>
                                <span>{cost.totalTokens} tokens (${cost.estimatedCost.toFixed(5)})</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Error and self-healing log */}
                    {errors.length > 0 && (
                      <div className="card">
                        <div className="card-title">
                          <span style={{color: 'var(--accent-rose)', display: 'flex', alignItems: 'center', gap: '8px'}}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                            Self-Healing Repairs ({errors.length})
                          </span>
                        </div>
                        <div className="error-panel">
                          {errors.map((err, i) => (
                            <div key={i} className="error-card">
                              <div 
                                className="error-card-header"
                                onClick={() => setExpandedErrorIndex(expandedErrorIndex === i ? null : i)}
                              >
                                <span className="error-title">{err.stage} Validation Failure</span>
                                <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>
                                  {expandedErrorIndex === i ? 'Collapse ▲' : 'Expand ▼'}
                                </span>
                              </div>
                              {expandedErrorIndex === i && (
                                <pre className="repair-terminal">
                                  {JSON.stringify(err.repairLog, null, 2)}
                                </pre>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Spec Viewer Workspace */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {appSpec ? (
                      <div className="card" style={{ padding: '20px' }}>
                        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>
                            </svg>
                            AppSpec Workspace
                          </span>
                          <div className="workspace-tabs">
                            <button className={`tab-btn ${activeSpecTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveSpecTab('overview')}>Overview</button>
                            <button className={`tab-btn ${activeSpecTab === 'pages' ? 'active' : ''}`} onClick={() => setActiveSpecTab('pages')}>Pages</button>
                            <button className={`tab-btn ${activeSpecTab === 'endpoints' ? 'active' : ''}`} onClick={() => setActiveSpecTab('endpoints')}>APIs</button>
                            <button className={`tab-btn ${activeSpecTab === 'auth' ? 'active' : ''}`} onClick={() => setActiveSpecTab('auth')}>Permissions</button>
                            <button className={`tab-btn ${activeSpecTab === 'workflows' ? 'active' : ''}`} onClick={() => setActiveSpecTab('workflows')}>Workflows</button>
                            <button className={`tab-btn ${activeSpecTab === 'json' ? 'active' : ''}`} onClick={() => setActiveSpecTab('json')}>Raw JSON</button>
                          </div>
                        </div>

                        {/* TAB 1: OVERVIEW */}
                        {activeSpecTab === 'overview' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div>
                              <h3 style={{fontSize: '1.1rem', fontWeight: 600, marginBottom: '8px'}}>App Specifications</h3>
                              <p style={{color: 'var(--text-secondary)', fontSize: '0.85rem'}}>
                                Summary of the successfully compiled app specification model. The system verified all access controls, schema definitions, and page routes.
                              </p>
                            </div>

                            <div className="spec-grid">
                              <div className="stat-box" style={{padding: '16px'}}>
                                <div className="stat-label">User Roles</div>
                                <div className="overview-pill-container">
                                  {appSpec.roles ? appSpec.roles.map((role: string) => (
                                    <span key={role} className="badge badge-indigo">{role}</span>
                                  )) : <span style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>None</span>}
                                </div>
                              </div>

                              <div className="stat-box" style={{padding: '16px'}}>
                                <div className="stat-label">System Metadata</div>
                                <div style={{marginTop: '8px', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '4px'}}>
                                  <div style={{display: 'flex', justifyContent: 'space-between'}}><span style={{color: 'var(--text-secondary)'}}>Pages:</span><strong>{appSpec.pages?.length || 0}</strong></div>
                                  <div style={{display: 'flex', justifyContent: 'space-between'}}><span style={{color: 'var(--text-secondary)'}}>Endpoints:</span><strong>{appSpec.apiEndpoints?.length || 0}</strong></div>
                                  <div style={{display: 'flex', justifyContent: 'space-between'}}><span style={{color: 'var(--text-secondary)'}}>Workflows:</span><strong>{appSpec.workflowStubs?.length || 0}</strong></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* TAB 2: PAGES */}
                        {activeSpecTab === 'pages' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div className="spec-table-container">
                              <table className="spec-table">
                                <thead>
                                  <tr>
                                    <th>Page Name</th>
                                    <th>Route Path</th>
                                    <th>Layout Type</th>
                                    <th>Bound Entity</th>
                                    <th>Components</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {appSpec.pages?.map((p: any) => (
                                    <tr key={p.name}>
                                      <td><strong>{p.name}</strong></td>
                                      <td><code style={{color: 'var(--accent-blue)', fontSize: '0.8rem'}}>{p.route}</code></td>
                                      <td><span className="badge badge-gray">{p.layout}</span></td>
                                      <td>{p.boundEntity ? <span className="badge badge-indigo">{p.boundEntity}</span> : <span style={{color: 'var(--text-muted)'}}>-</span>}</td>
                                      <td>
                                        <div style={{display: 'flex', flexWrap: 'wrap', gap: '4px'}}>
                                          {p.components?.map((c: string) => (
                                            <span key={c} className="badge badge-gray" style={{fontSize: '0.7rem'}}>{c}</span>
                                          ))}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                  {(!appSpec.pages || appSpec.pages.length === 0) && (
                                    <tr>
                                      <td colSpan={5} style={{textAlign: 'center', color: 'var(--text-secondary)'}}>No pages defined.</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* TAB 3: API ENDPOINTS */}
                        {activeSpecTab === 'endpoints' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div className="spec-table-container">
                              <table className="spec-table">
                                <thead>
                                  <tr>
                                    <th>Method</th>
                                    <th>Path</th>
                                    <th>Bound Entity</th>
                                    <th>Auth Required</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {appSpec.apiEndpoints?.map((api: any, i: number) => {
                                    const m = api.method.toLowerCase();
                                    const verbClass = m === 'get' ? 'verb-get' : m === 'post' ? 'verb-post' : m === 'put' ? 'verb-put' : m === 'delete' ? 'verb-delete' : 'verb-patch';
                                    
                                    return (
                                      <tr key={i}>
                                        <td><span className={`verb-badge ${verbClass}`}>{api.method.toUpperCase()}</span></td>
                                        <td><code style={{color: 'var(--text-primary)', fontSize: '0.8rem'}}>{api.path}</code></td>
                                        <td><span className="badge badge-indigo">{api.boundEntity}</span></td>
                                        <td>
                                          {api.authRequired ? (
                                            <span className="badge badge-amber">Required</span>
                                          ) : (
                                            <span className="badge badge-gray">Public</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  {(!appSpec.apiEndpoints || appSpec.apiEndpoints.length === 0) && (
                                    <tr>
                                      <td colSpan={4} style={{textAlign: 'center', color: 'var(--text-secondary)'}}>No endpoints defined.</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* TAB 4: PERMISSIONS */}
                        {activeSpecTab === 'auth' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div className="spec-table-container">
                              <table className="spec-table">
                                <thead>
                                  <tr>
                                    <th>Role</th>
                                    <th>Entity Target</th>
                                    <th style={{textAlign: 'center'}}>Read</th>
                                    <th style={{textAlign: 'center'}}>Write</th>
                                    <th style={{textAlign: 'center'}}>Delete</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {appSpec.authRules?.map((rule: any, i: number) => (
                                    <tr key={i}>
                                      <td><strong>{rule.role}</strong></td>
                                      <td><span className="badge badge-indigo">{rule.entity}</span></td>
                                      <td style={{textAlign: 'center'}}>{rule.permissions.read ? <span style={{color: 'var(--accent-emerald)'}}>✅</span> : <span style={{opacity: 0.3}}>❌</span>}</td>
                                      <td style={{textAlign: 'center'}}>{rule.permissions.write ? <span style={{color: 'var(--accent-emerald)'}}>✅</span> : <span style={{opacity: 0.3}}>❌</span>}</td>
                                      <td style={{textAlign: 'center'}}>{rule.permissions.delete ? <span style={{color: 'var(--accent-emerald)'}}>✅</span> : <span style={{opacity: 0.3}}>❌</span>}</td>
                                    </tr>
                                  ))}
                                  {(!appSpec.authRules || appSpec.authRules.length === 0) && (
                                    <tr>
                                      <td colSpan={5} style={{textAlign: 'center', color: 'var(--text-secondary)'}}>No permission rules defined.</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* TAB 5: WORKFLOWS */}
                        {activeSpecTab === 'workflows' && (
                          <div className="workflow-stubs-container">
                            {appSpec.workflowStubs?.map((stub: any, i: number) => (
                              <div key={i} className="workflow-node">
                                <div className="node-part">
                                  <span className="node-part-title">Trigger Event</span>
                                  <span className="node-part-val">{stub.trigger.entity} ({stub.trigger.event})</span>
                                </div>
                                <div className="node-arrow">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                                  </svg>
                                </div>
                                <div className="node-part" style={{ borderColor: 'var(--accent-purple)' }}>
                                  <span className="node-part-title">Integration Hub</span>
                                  <span className="node-part-val">{stub.integration}</span>
                                </div>
                                <div className="node-arrow">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                                  </svg>
                                </div>
                                <div className="node-part" style={{ borderColor: 'var(--accent-indigo)' }}>
                                  <span className="node-part-title">Webhook / Action</span>
                                  <span className="node-part-val">{stub.action}</span>
                                </div>
                              </div>
                            ))}
                            {(!appSpec.workflowStubs || appSpec.workflowStubs.length === 0) && (
                              <p style={{textAlign: 'center', color: 'var(--text-secondary)', padding: '20px'}}>No workflow stubs defined.</p>
                            )}
                          </div>
                        )}

                        {/* TAB 6: RAW JSON */}
                        {activeSpecTab === 'json' && (
                          <div className="code-block">
                            <div className="code-block-header">
                              <span>appspec.json</span>
                              <button className="btn-copy" onClick={copyToClipboard}>
                                {copied ? 'Copied!' : 'Copy Code'}
                              </button>
                            </div>
                            <pre className="raw-json">
                              {JSON.stringify(appSpec, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center', minHeight: '300px', opacity: 0.8 }}>
                        <div style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
                          </svg>
                        </div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Specification Workspace</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', maxWidth: '300px' }}>
                          Once compilation starts, the stage outputs and generated schemas will display here.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* INTEGRATION REGISTRY TAB */
            <div className="integrations-wrapper">
              <div style={{ marginBottom: '8px' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  The registry contains pre-configured integrations that the compilation engine hooks into when stubs are requested.
                </p>
              </div>

              <div className="spec-grid">
                {integrations.map(int => (
                  <div key={int.id} className="integration-card">
                    <div className="integration-header">
                      <span className="integration-name">{int.displayName}</span>
                      <span className="badge badge-indigo">{int.authType}</span>
                    </div>
                    
                    <div className="integration-meta">
                      <div className="meta-row">
                        <span className="meta-label">Triggers:</span>
                        <div className="meta-values">
                          {int.triggers.length > 0 ? int.triggers.map((t: any) => (
                            <span key={t.id} className="badge badge-gray">{t.name}</span>
                          )) : <span style={{color: 'var(--text-muted)', fontSize: '0.85rem'}}>None</span>}
                        </div>
                      </div>

                      <div className="meta-row">
                        <span className="meta-label">Actions:</span>
                        <div className="meta-values">
                          {int.actions.length > 0 ? int.actions.map((a: any) => (
                            <span key={a.id} className="badge badge-gray">{a.name}</span>
                          )) : <span style={{color: 'var(--text-muted)', fontSize: '0.85rem'}}>None</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
