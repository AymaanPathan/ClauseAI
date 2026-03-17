"use strict";
// ============================================================
// lib/socket.ts — Socket.io client singleton
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSocket = getSocket;
exports.joinAgreementRoom = joinAgreementRoom;
exports.joinDisputeRoom = joinDisputeRoom;
exports.leaveDisputeRoom = leaveDisputeRoom;
exports.disconnectSocket = disconnectSocket;
const socket_io_client_1 = require("socket.io-client");
const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL;
let socket = null;
function getSocket() {
    if (!socket) {
        socket = (0, socket_io_client_1.io)(API_BASE, {
            transports: ["websocket", "polling"],
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
        });
        socket.on("connect", () => console.log("[socket.io] connected:", socket?.id));
        socket.on("disconnect", () => console.log("[socket.io] disconnected"));
        socket.on("connect_error", (err) => console.warn("[socket.io] error:", err.message));
    }
    return socket;
}
function joinAgreementRoom(agreementId) {
    getSocket().emit("join:agreement", agreementId);
}
// Join a dispute-specific room for real-time statement/evidence updates.
// Room key on server: "dispute:{agreementId}:{milestoneIndex}"
function joinDisputeRoom(agreementId, milestoneIndex) {
    getSocket().emit("join:dispute", { agreementId, milestoneIndex });
}
function leaveDisputeRoom(agreementId, milestoneIndex) {
    getSocket().emit("leave:dispute", { agreementId, milestoneIndex });
}
function disconnectSocket() {
    socket?.disconnect();
    socket = null;
}
