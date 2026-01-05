"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { PlugZap } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";

import { useBmsDashboard } from "@/lib/hooks/useBmsDashboard";
import { BmsTabContent } from "@/components/dashboard/BmsTabContent";
import { RangeSelector } from "@/components/dashboard/RangeSelector";

export default function Page() {
  const {
    pass,
    setPass,
    connect,
    disconnect,
    paused,
    togglePause,
    range,
    setRange,
    loadHistory,
    showV,
    setShowV,
    showI,
    setShowI,
    showSoc,
    setShowSoc,
    bms,
    cellDeltas,
  } = useBmsDashboard();

  const [activeTab, setActiveTab] = useState<"1" | "2">("1");

  const currentBms = bms[activeTab === "1" ? 1 : 2];
  const isConnected = currentBms.connected || currentBms.connecting;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-background/90 backdrop-blur border-b px-3">
        <div className="container flex items-center gap-3 py-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md grid place-items-center bg-foreground/5">
              <PlugZap size={18} />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-medium">Daly BMS Dashboard</div>
              <div className="text-xs text-muted-foreground">
                Dual BMS Monitor • {isConnected ? "Live" : "Disconnected"}
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {!isConnected ? (
              <Button onClick={connect}>Connect</Button>
            ) : (
              <Button variant="outline" onClick={disconnect}>
                Disconnect
              </Button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {!isConnected && (
        <div className="container flex justify-end py-2">
          <Input
            type="password"
            placeholder="pass"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="w-40"
          />
        </div>
      )}

      <main className="container py-4 px-1">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "1" | "2")}
          className="w-full"
        >
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 my-6">
            <TabsTrigger value="1">BMS 1</TabsTrigger>
            <TabsTrigger value="2">BMS 2</TabsTrigger>
          </TabsList>

          {/* Animated Tab Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{
                duration: 0.4,
                ease: "easeOut",
              }}
              className="mt-4"
            >
              {activeTab === "1" ? (
                <BmsTabContent
                  bmsId={1}
                  snapshot={bms[1].snapshot}
                  device={bms[1].device}
                  chartData={bms[1].chartData}
                  showV={showV}
                  showI={showI}
                  showSoc={showSoc}
                  cellDelta={cellDeltas[1]}
                  connecting={bms[1].connecting}
                  connected={bms[1].connected}
                />
              ) : (
                <BmsTabContent
                  bmsId={2}
                  snapshot={bms[2].snapshot}
                  device={bms[2].device}
                  chartData={bms[2].chartData}
                  showV={showV}
                  showI={showI}
                  showSoc={showSoc}
                  cellDelta={cellDeltas[2]}
                  connecting={bms[2].connecting}
                  connected={bms[2].connected}
                />
              )}
            </motion.div>
          </AnimatePresence>

          {/* Controls below tabs */}
          <div className="flex flex-wrap items-center justify-center gap-4 my-8">
            <RangeSelector
              value={range}
              onChange={(r) => {
                setRange(r);
                loadHistory(r, activeTab === "1" ? 1 : 2);
              }}
            />

            <div className="flex gap-2">
              <button
                onClick={() => setShowV((s) => !s)}
                className={`p-3 rounded-lg border transition-all ${
                  showV
                    ? "bg-primary/10 text-primary border-primary/50"
                    : "bg-muted/5 border-muted"
                }`}
                disabled={!isConnected}
              >
                <span className="font-medium">V</span>
              </button>
              <button
                onClick={() => setShowI((s) => !s)}
                className={`p-3 rounded-lg border transition-all ${
                  showI
                    ? "bg-primary/10 text-primary border-primary/50"
                    : "bg-muted/5 border-muted"
                }`}
                disabled={!isConnected}
              >
                <span className="font-medium">I</span>
              </button>
              <button
                onClick={() => setShowSoc((s) => !s)}
                className={`p-3 rounded-lg border transition-all ${
                  showSoc
                    ? "bg-primary/10 text-primary border-primary/50"
                    : "bg-muted/5 border-muted"
                }`}
                disabled={!isConnected}
              >
                <span className="font-medium">SoC</span>
              </button>
              <button
                onClick={togglePause}
                className="p-3 rounded-lg border bg-muted/10"
                disabled={!isConnected}
              >
                {paused ? "▶" : "⏸"}
              </button>
            </div>
          </div>
        </Tabs>
      </main>
    </div>
  );
}
