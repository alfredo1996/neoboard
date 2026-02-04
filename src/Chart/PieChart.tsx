import React from "react";
import ReactECharts from "echarts-for-react";

export default function PieChartExample() {
    const option = {
        tooltip: {
            trigger: "item",
            formatter: "{a} <br/>{b}: {c} ({d}%)",
        },
        legend: {
            orient: "vertical",
            left: "left",
        },
        series: [
            {
                name: "Vendite",
                type: "pie",
                radius: "50%",      // dimensione del cerchio
                center: ["50%", "50%"], // centrato
                data: [
                    { value: 40, name: "Gen" },
                    { value: 20, name: "Feb" },
                    { value: 30, name: "Mar" },
                    { value: 10, name: "Apr" },
                ],
                emphasis: {
                    itemStyle: {
                        shadowBlur: 10,
                        shadowOffsetX: 0,
                        shadowColor: "rgba(0, 0, 0, 0.5)",
                    },
                },
            },
        ],
    };

    return (
        <div style={{ width: "100%", height: "500px" }}>
            <ReactECharts
                option={option}
                style={{ width: "100%", height: "100%" }}
            />
        </div>
    );
}
