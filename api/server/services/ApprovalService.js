/**
 * Approval Service
 * File: api/server/services/ApprovalService.js (NEU in LibreChat!)
 *
 * Manages SSE connections, pending approval requests, and responses
 *
 * ✅ FIXED: User Isolation - Approvals are now filtered by userId
 */

class ApprovalService {
    constructor() {
        // Map of connected SSE clients with user context
        // clientId -> { res: Response, userId: string }
        this.clients = new Map();

        // Map of pending approval requests
        this.pendingRequests = new Map(); // requestId -> { request, promise resolve/reject }

        console.log('[ApprovalService] Initialized with user isolation support');
    }

    /**
     * Add a new SSE client with user context
     * @param {Response} res - Express response object
     * @param {string} userId - User ID for filtering approvals
     * @returns {string} clientId
     */
    addClient(res, userId) {
        const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Store both response object AND userId
        this.clients.set(clientId, { res, userId });

        console.log(`[ApprovalService] Client added: ${clientId} (user: ${userId}, total: ${this.clients.size})`);

        return clientId;
    }

    /**
     * Remove an SSE client
     * @param {string} clientId
     */
    removeClient(clientId) {
        const client = this.clients.get(clientId);
        const removed = this.clients.delete(clientId);

        if (removed && client) {
            console.log(`[ApprovalService] Client removed: ${clientId} (user: ${client.userId}, total: ${this.clients.size})`);
        }
    }

    /**
     * Get all connected userIds (for fallback when MCP proxy doesn't provide userId)
     * @returns {string[]} Array of unique userIds
     */
    getConnectedUserIds() {
        const userIds = new Set();
        this.clients.forEach((client) => {
            if (client.userId && client.userId !== 'default-user') {
                userIds.add(client.userId);
            }
        });
        return Array.from(userIds);
    }

    /**
     * Broadcast approval request to connected SSE clients of a specific user
     * @param {Object} approvalRequest - Must contain userId field
     */
    broadcastApprovalRequest(approvalRequest) {
        const message = {
            type: 'approval_request',
            data: approvalRequest
        };

        const messageStr = `data: ${JSON.stringify(message)}\n\n`;

        let successCount = 0;
        let failureCount = 0;
        let filteredCount = 0;

        const targetUserId = approvalRequest.userId;

        if (!targetUserId) {
            console.warn('[ApprovalService] ⚠️  Approval request without userId - broadcasting to all clients (insecure!)');
        }

        this.clients.forEach((client, clientId) => {
            // ✅ USER ISOLATION: Only send to clients matching the userId
            if (targetUserId && client.userId !== targetUserId) {
                filteredCount++;
                return; // Skip this client
            }

            try {
                client.res.write(messageStr);
                successCount++;
            } catch (error) {
                console.error(`[ApprovalService] Error sending to client ${clientId}:`, error.message);
                this.removeClient(clientId);
                failureCount++;
            }
        });

        console.log(`[ApprovalService] Broadcast for user '${targetUserId}': ${successCount} sent, ${failureCount} failed, ${filteredCount} filtered`);

        // Store as pending
        this.pendingRequests.set(approvalRequest.id, {
            request: approvalRequest,
            resolve: null,
            reject: null,
            createdAt: Date.now()
        });
    }

    /**
     * Wait for user response
     * @param {string} requestId
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise<Object|null>} - { approved, policy } or null on timeout
     */
    waitForResponse(requestId, timeout = 60000) {
        return new Promise((resolve, reject) => {
            const pending = this.pendingRequests.get(requestId);

            if (!pending) {
                return reject(new Error('Request not found'));
            }

            // Store resolve/reject functions
            pending.resolve = resolve;
            pending.reject = reject;

            // Set timeout
            const timeoutId = setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    console.log(`[ApprovalService] Request ${requestId} timed out`);
                    this.pendingRequests.delete(requestId);
                    resolve(null); // Return null on timeout
                }
            }, timeout);

            // Store timeout ID for cleanup
            pending.timeoutId = timeoutId;
        });
    }

    /**
     * Resolve a pending approval request with user validation
     * @param {string} requestId
     * @param {Object} response - { approved, policy, userId }
     * @returns {boolean} - Success
     */
    resolveRequest(requestId, response) {
        const pending = this.pendingRequests.get(requestId);

        if (!pending) {
            console.warn(`[ApprovalService] Request ${requestId} not found`);
            return false;
        }

        // ✅ USER ISOLATION: Validate that the responding user matches the request
        if (response.userId && pending.request.userId && response.userId !== pending.request.userId) {
            console.error(`[ApprovalService] ⚠️  Security violation: User '${response.userId}' attempted to respond to approval for user '${pending.request.userId}'`);
            return false;
        }

        // Clear timeout
        if (pending.timeoutId) {
            clearTimeout(pending.timeoutId);
        }

        // Resolve promise
        if (pending.resolve) {
            pending.resolve(response);
        }

        // Remove from pending
        this.pendingRequests.delete(requestId);

        console.log(`[ApprovalService] Request ${requestId} resolved: ${response.approved ? 'APPROVED' : 'DENIED'} by user '${response.userId || pending.request.userId}'`);

        return true;
    }

    /**
     * Get pending approval requests, optionally filtered by userId
     * @param {string} [userId] - Optional: filter by userId
     * @returns {Array<Object>}
     */
    getPendingRequests(userId = null) {
        const requests = [];

        this.pendingRequests.forEach((pending, requestId) => {
            // ✅ USER ISOLATION: Filter by userId if provided
            if (userId && pending.request.userId !== userId) {
                return; // Skip this request
            }

            requests.push({
                ...pending.request,
                pendingSince: pending.createdAt
            });
        });

        if (userId) {
            console.log(`[ApprovalService] Returning ${requests.length} pending requests for user '${userId}'`);
        }

        return requests;
    }

    /**
     * Cleanup old pending requests (optional housekeeping)
     * @param {number} maxAge - Max age in milliseconds (default: 5 minutes)
     */
    cleanupOldRequests(maxAge = 300000) {
        const now = Date.now();
        let cleanedCount = 0;

        this.pendingRequests.forEach((pending, requestId) => {
            if (now - pending.createdAt > maxAge) {
                console.log(`[ApprovalService] Cleaning up old request: ${requestId}`);

                // Clear timeout
                if (pending.timeoutId) {
                    clearTimeout(pending.timeoutId);
                }

                // Reject promise
                if (pending.reject) {
                    pending.reject(new Error('Request expired'));
                }

                this.pendingRequests.delete(requestId);
                cleanedCount++;
            }
        });

        if (cleanedCount > 0) {
            console.log(`[ApprovalService] Cleaned up ${cleanedCount} old requests`);
        }
    }

    /**
     * Get statistics
     * @returns {Object}
     */
    getStats() {
        // Group clients by userId for stats
        const clientsByUser = {};
        this.clients.forEach((client, clientId) => {
            const userId = client.userId || 'unknown';
            if (!clientsByUser[userId]) {
                clientsByUser[userId] = [];
            }
            clientsByUser[userId].push(clientId);
        });

        return {
            connectedClients: this.clients.size,
            pendingRequests: this.pendingRequests.size,
            clientsByUser: clientsByUser,
            requestIds: Array.from(this.pendingRequests.keys())
        };
    }
}

module.exports = ApprovalService;
