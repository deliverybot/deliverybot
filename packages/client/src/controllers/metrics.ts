import { Controller } from "./base";
import ApexCharts from "apexcharts";

export class MetricsController extends Controller {
  static targets = ["loader", "total", "day", "lead"];

  async connect() {
    const resp = await fetch(window.location.href, {
      headers: { accept: "application/json" },
    });
    const data = await resp.json();
    const metrics = data.metrics;
    this.update(metrics);
  }

  async update(data: any) {
    const loader = this.targets.find("loader");
    const total = this.targets.find("total");
    const day = this.targets.find("day");
    const lead = this.targets.find("lead");
    const chart = this.targets.find("chart") as HTMLElement | undefined;

    if (loader) loader.remove();
    if (total) total.innerHTML = `${data.totalDeploys}`;
    if (day) day.innerHTML = `${data.avgDeploysPerDayWords}`;
    if (lead) lead.innerHTML = `${data.avgLeadTimeWords}`;

    if (!chart) {
      return;
    }
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    // ApexCharts' grid and axis lines default to a fixed light gray, even in
    // its dark theme, so take them from Primer's border token.
    const lineColor = getComputedStyle(document.documentElement)
      .getPropertyValue("--borderColor-muted")
      .trim();
    new ApexCharts(chart, {
      chart: {
        height: 250,
        type: "line",
        background: "transparent",
        toolbar: { show: false },
        zoom: { enabled: false },
      },
      theme: { mode: dark ? "dark" : "light" },
      grid: { borderColor: lineColor },
      colors: ["#0366d6", "#28a745", "#6f42c1", "#ea4aaa", "#d73a49"],
      // ApexCharts 8 draws a white ring around the legend dots and puts them
      // right against the label, so drop the ring and add a little space.
      legend: {
        markers: { strokeWidth: 0, offsetX: -4 },
        itemMargin: { horizontal: 8 },
      },
      dataLabels: { enabled: false },
      stroke: { width: 1.5 },
      xaxis: {
        categories: data.allDaysWords,
        axisBorder: { color: lineColor },
        axisTicks: { color: lineColor },
      },
      series: data.environments.map((env: string) => {
        return {
          name: env,
          data: data.allDays.map((day: string) => {
            return data.deploysByDayAndEnv[`${day}.${env}`] || 0;
          }),
        };
      }),
    }).render();
  }
}
