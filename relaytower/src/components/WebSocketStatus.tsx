"use client";
import { useGamepadContext } from "@/contexts/GamepadContext";
import { ActionKey } from "@/hooks/useGamepad";
import { useEffect, useRef, useState } from "react";
import { Card } from "./ui/card";

export default function WebSocketStatus() {
  const [status, setStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("disconnected");
  const [pingTime, setPingTime] = useState<number | null>(null);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const pingTimestampRef = useRef<number>(0);
  const { isActionActive, getAxisValueForAction, selectedGamepadId, mappings } =
    useGamepadContext();

  // Store function references in refs to avoid dependency issues
  const functionsRef = useRef({
    isActionActive,
    getAxisValueForAction,
  });

  // Keep refs in sync with the latest functions
  useEffect(() => {
    functionsRef.current = {
      isActionActive,
      getAxisValueForAction,
    };
  }, [isActionActive, getAxisValueForAction]);

  useEffect(() => {
    // Connect to websocket
    const ws = new WebSocket("ws://localhost:3000/ws");

    ws.onopen = () => {
      console.log("Connected to gamepad server");
      setStatus("connected");
    };

    ws.onclose = () => {
      console.log("Disconnected from gamepad server");
      setStatus("disconnected");
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setStatus("disconnected");
    };

    ws.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data);

        if (event.name === "pong") {
          // Calculate round-trip time in milliseconds
          const now = Date.now();
          const latency = now - event.data.sentAt;
          setPingTime(latency);
        }
      } catch (e) {
        console.error("Error parsing websocket message:", e);
      }
    };
    setSocket(ws);

    // Ping
    const pingLoop = setInterval(() => {
      ws.send(
        JSON.stringify({
          name: "ping",
          data: {
            sentAt: Date.now(),
          },
          createdAt: Date.now(),
        })
      );
    }, 500);

    return () => {
      ws.close();
      clearInterval(pingLoop);
    };
  }, []);

  // Helper function to get the appropriate value for "both" type actions
  const getActionValue = (actionKey: ActionKey) => {
    const mapping = mappings[actionKey as keyof typeof mappings];

    // If mapping doesn't exist or is not set (-1), return 0 or false
    if (!mapping || mapping.index === -1) {
      return actionKey === "accelerate" || actionKey === "brake" ? false : 0;
    }

    // If mapped to a button, return boolean
    if (mapping.type === "button") {
      return isActionActive(actionKey);
    }

    // If mapped to an axis, return axis value
    if (mapping.type === "axis") {
      return getAxisValueForAction(actionKey) ?? 0;
    }

    // Fallback
    return actionKey === "accelerate" || actionKey === "brake" ? false : 0;
  };

  const computeSpeed = () => {
    const { isActionActive, getAxisValueForAction } = functionsRef.current;
    const accelerateMapping = mappings["accelerate"];
    const brakeMapping = mappings["brake"];

    const accelerateValue = () => {
      if (!accelerateMapping || accelerateMapping.index === -1) {
        return 0;
      }

      if (accelerateMapping.type === "button") {
        if (isActionActive("accelerate")) {
          return 1;
        } else {
          return 0;
        }
      }

      if (accelerateMapping.type === "axis") {
        return getAxisValueForAction("accelerate") ?? 0;
      }

      return 0;
    };

    const brakeValue = () => {
      if (!brakeMapping || brakeMapping.index === -1) {
        return 0;
      }

      if (brakeMapping.type === "button") {
        if (isActionActive("brake")) {
          return 1;
        } else {
          return 0;
        }
      }

      if (brakeMapping.type === "axis") {
        return getAxisValueForAction("brake") ?? 0;
      }

      return 0;
    };

    return accelerateValue() - brakeValue();
  };

  // Send gamepad state periodically
  useEffect(() => {
    console.log("Use effect qui prend son air consangin, euhhhh, hautin");

    // Only send data if connected to WebSocket AND have a selected gamepad
    if (!socket || status !== "connected" || !selectedGamepadId) return;

    const interval = setInterval(() => {
      pingTimestampRef.current = Date.now();

      // Use the functions from the ref instead of the closure
      const { isActionActive, getAxisValueForAction } = functionsRef.current;

      // Send the current gamepad state with proper handling of "both" type actions
      const gamepadState = {
        speed: computeSpeed(),
        turn: getAxisValueForAction("turn") ?? 0,
        turnCameraX: getAxisValueForAction("turnCameraX") ?? 0,
        turnCameraY: getAxisValueForAction("turnCameraY") ?? 0,
        use: isActionActive("use"),
      };

      socket.send(
        JSON.stringify({
          name: "gamepad_input", // Updated to match server expectation
          data: gamepadState,
          createdAt: pingTimestampRef.current,
        })
      );
    }, 1000); // ~33 updates per second

    return () => clearInterval(interval);
  }, [
    socket,
    status,
    selectedGamepadId,
    mappings, // Still need mappings for equality check
  ]); // Removed function references from dependencies

  return (
    <Card className="p-4">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Server Connection</h3>
          <div className="flex items-center">
            <div
              className={`w-3 h-3 rounded-full mr-2 ${
                status === "connected"
                  ? "bg-green-500"
                  : status === "connecting"
                  ? "bg-yellow-500"
                  : "bg-red-500"
              }`}
            ></div>
            <span className="text-sm">
              {status === "connected"
                ? "Connected"
                : status === "connecting"
                ? "Connecting..."
                : "Disconnected"}
            </span>
          </div>
        </div>
        {pingTime !== null && (
          <p className="text-xs text-gray-500">Ping: {pingTime} ms</p>
        )}
      </div>
    </Card>
  );
}
