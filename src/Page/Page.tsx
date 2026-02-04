import React, { useState } from 'react';
import Grid from "../Grid/grid.tsx";

const tabs = [
    { id: 'dashboard1', label: 'Page 1' },
    { id: 'dashboard2', label: 'Dashboard 2' },
    { id: 'dashboard3', label: 'Dashboard 3' },
];

const Page: React.FC = () => {
    const [activeTab, setActiveTab] = useState('dashboard1');

    return (
        <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: '#f5f5f7'
        }}>

            {/* Tabs */}
            <div
                style={{
                    display: 'flex',
                    padding: '10px 20px',
                    borderBottom: '1px solid rgba(0,0,0,0.1)',
                    background: 'white',
                    gap: '15px',
                }}
            >
                {tabs.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setActiveTab(t.id)}
                        style={{
                            padding: '8px 18px',
                            borderRadius: '10px',
                            border: 'none',
                            cursor: 'pointer',
                            fontWeight: 500,
                            background: activeTab === t.id ? '#007aff' : 'transparent',
                            color: activeTab === t.id ? 'white' : '#1c1c1e',
                            transition: '0.2s',
                        }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Contenuto */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
                {activeTab === 'dashboard1' && <Grid />}
                {activeTab === 'dashboard2' && <Grid />}
                {activeTab === 'dashboard3' && <Grid />}
            </div>
        </div>
    );
};

export default Page;
