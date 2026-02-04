import React, { useRef, useState, useEffect } from 'react';
import GridLayout from 'react-grid-layout';
import Card from '../Card/Card.tsx';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

type LayoutItem = {
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
    type: string;
};

const initialLayout: LayoutItem[] = [
    { i: '1', x: 0, y: 0, w: 3, h: 2, type: "radar" },
    { i: '2', x: 3, y: 0, w: 3, h: 2, type: "line" },
    { i: '3', x: 6, y: 0, w: 3, h: 2, type: "bar" },
    { i: '4', x: 6, y: 0, w: 3, h: 2, type: "pie" }
];

const Grid: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                setDimensions({
                    width: containerRef.current.offsetWidth,
                    height: containerRef.current.offsetHeight,
                });
            }
        };
        updateDimensions();
        window.addEventListener('resize', updateDimensions);
        return () => window.removeEventListener('resize', updateDimensions);
    }, []);

    const rowHeight = dimensions.height ? Math.floor(dimensions.height / 12) : 30; // 12 righe di default

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', padding: '20px', boxSizing: 'border-box' }}>
            {dimensions.width > 0 && (
                <GridLayout
                    className="layout"
                    layout={initialLayout}
                    cols={12}
                    rowHeight={rowHeight}
                    width={dimensions.width}
                    draggableHandle=".drag-handle"
                >
                    {initialLayout.map(item => (
                        <div key={item.i}>
                            <Card item={item}>
                                Contenuto del widget {item.i}
                            </Card>
                        </div>
                    ))}
                </GridLayout>
            )}
        </div>
    );
};

export default Grid;
