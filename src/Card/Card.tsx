import React from 'react';
import LineChartExample from "../Chart/LinearChart.tsx";
import BarChartExample from "../Chart/BarChart.tsx";
import RadarChartExample from "../Chart/RadarChart.tsx";
import PieChartExample from "../Chart/PieChart.tsx";

type CardProps = {
    children: React.ReactNode;
    item: any;
};

const Card: React.FC<CardProps> = ({ children, item }) => {
    return (
        <div
            style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                background: 'rgba(255, 255, 255, 0.95)', // sfondo chiaro e leggermente trasparente
                borderRadius: '15px', // angoli arrotondati
                boxShadow: '0 10px 25px rgba(0,0,0,0.1)', // ombra leggera
                overflow: 'hidden', // taglia contenuti che eccedono
                border: '1px solid rgba(0,0,0,0.05)', // bordo sottile
            }}
        >
            {/* Header minimale con handle */}
            <div
                className="drag-handle"
                style={{
                    cursor: 'move',
                    padding: '10px 15px',
                    fontWeight: 600,
                    fontSize: '1rem',
                    background: 'rgba(245, 245, 245, 0.8)',
                    borderBottom: '1px solid rgba(0,0,0,0.05)',
                    userSelect: 'none',
                }}
            >
                {`Widget ${item.i}`}
            </div>

            {/* Contenuto */}
            <div style={{padding: '15px', flex: 1, overflow: 'hidden'}}>
                {item.type === 'line' && <LineChartExample/>}
                {item.type === 'bar' && <BarChartExample/>}
                {item.type === 'radar' && <RadarChartExample/>}
                {item.type === 'pie' && <PieChartExample/>}
            </div>
        </div>
    );
};

export default Card;
