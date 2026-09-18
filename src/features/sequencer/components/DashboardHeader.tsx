import type { DashboardState } from '../types';

export function DashboardHeader({
  data,
  activeView,
  onViewChange,
}: {
  data: DashboardState | null;
  activeView: 'overview' | 'mailboxes';
  onViewChange: (view: 'overview' | 'mailboxes') => void;
}) {
  const airtableConnected = Boolean(data?.airtable.connected);

  return (
    <header className="app-header">
      <div className="brand-row">
        <h1>Email Sequencer</h1>
        <p
          className={`connection-indicator ${
            airtableConnected ? 'success' : 'danger-text'
          }`}
        >
          <i className="dot" />
          {airtableConnected ? 'Airtable connected' : 'Airtable unavailable'}
        </p>
      </div>
      <nav className="primary-navigation" aria-label="Primary navigation">
        <button
          className={activeView === 'overview' ? 'selected' : ''}
          type="button"
          aria-current={activeView === 'overview' ? 'page' : undefined}
          onClick={() => onViewChange('overview')}
        >
          Overview
        </button>
        <button
          className={activeView === 'mailboxes' ? 'selected' : ''}
          type="button"
          aria-current={activeView === 'mailboxes' ? 'page' : undefined}
          onClick={() => onViewChange('mailboxes')}
        >
          Mailboxes
        </button>
      </nav>
    </header>
  );
}
