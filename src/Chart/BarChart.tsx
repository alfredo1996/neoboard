import React from "react";
import ReactECharts from "echarts-for-react";

export default function BarChartExample() {
    const option = {
        tooltip: {
            trigger: "axis",
        },
        xAxis: {
            type: "category",
            data: ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug"],
        },
        yAxis: {
            type: "value",
        },
        series: [
            {
                name: "Valori",
                type: "bar",
                smooth: true,
                data: [10, 20, 15, 30, 25, 40, 35],
            },
        ],
        grid: {
            left: "3%",
            right: "4%",
            bottom: "3%",
            containLabel: true,
        },
    };

    return (
        <div style={{ width: "100%", height: "100%" }}>
            <ReactECharts option={option} style={{ width: "100%", height: "100%" }} />
        </div>
    );
}