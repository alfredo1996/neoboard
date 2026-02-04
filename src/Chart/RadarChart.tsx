import React from "react";
import ReactECharts from "echarts-for-react";

export default function RadarChartResponsive() {
    const option = {
        tooltip: {},
        radar: {
            indicator: [
                { name: "Velocità", max: 100 },
                { name: "Forza", max: 100 },
                { name: "Resistenza", max: 100 },
                { name: "Agilità", max: 100 },
                { name: "Tecnica", max: 100 },
            ],
            radius: "70%",           // scala con il contenitore
            center: ["50%", "50%"],  // sempre centrato
        },
        series: [
            {
                name: "Atleti",
                type: "radar",
                data: [
                    { value: [80, 90, 70, 85, 75], name: "Atleta A" },
                    { value: [70, 85, 75, 80, 90], name: "Atleta B" },
                ],
                areaStyle: { opacity: 0.2 },
            },
        ],
    };

    return (
        <div style={{ width: "100%", height: "100%", minHeight: "400px" }}>
            <ReactECharts
                option={option}
                style={{ width: "100%", height: "100%" }}
            />
        </div>
    );
}
