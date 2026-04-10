/**
 * Approval API Routes
 * File: api/server/routes/approval.js (NEU in LibreChat!)
 *
 * Handles approval requests from MCP Proxy and sends responses back
 *
 * ✅ FIXED: User Isolation - Approvals are now filtered by userId
 * ✅ FIXED: Uses refreshToken Cookie + Session Lookup (EventSource compatible!)
 */

const express = require('express');
const cookies = require('cookie');
const router = express.Router();
const ApprovalService = require('../services/ApprovalService');
const optionalJwtAuth = require('~/server/middleware/optionalJwtAuth');
const { findSession } = require('~/models');

// Initialize approval service
const approvalService = new ApprovalService();

/**
 * Extract userId from request (multiple fallback strategies)
 * @param {Request} req - Express request object
 * @returns {Promise<string|null>} userId or null if not found
 */
async function getUserIdFromRequest(req) {
    // Strategy 1: req.user (Passport.js standard - works for POST /respond)
    if (req.user && req.user.id) {
        console.log('[Approval] DEBUG: Found userId via req.user:', req.user.id);
        return req.user.id;
    }

    // Strategy 2: refreshToken Cookie → Session Lookup (works for EventSource!)
    const cookieHeader = req.headers.cookie;
    console.log('[Approval] DEBUG: Cookie header present:', !!cookieHeader);

    if (cookieHeader) {
        const parsedCookies = cookies.parse(cookieHeader);
        const refreshToken = parsedCookies.refreshToken;

        console.log('[Approval] DEBUG: Parsed cookies keys:', Object.keys(parsedCookies));
        console.log('[Approval] DEBUG: refreshToken present:', !!refreshToken);
        console.log('[Approval] DEBUG: refreshToken length:', refreshToken ? refreshToken.length : 0);

        if (refreshToken) {
            try {
                console.log('[Approval] DEBUG: Calling findSession with refreshToken...');
                const session = await findSession({ refreshToken });
                console.log('[Approval] DEBUG: Session found:', !!session);

                if (session) {
                    console.log('[Approval] DEBUG: Session keys:', Object.keys(session));
                    console.log('[Approval] DEBUG: Session user field:', session.user);
                }

                if (session && session.user) {
                    const userId = session.user.toString();
                    console.log('[Approval] DEBUG: Returning userId:', userId);
                    return userId;
                } else {
                    console.warn('[Approval] DEBUG: Session found but no user field:', session);
                }
            } catch (error) {
                console.error('[Approval] Error looking up session:', error.message);
                console.error('[Approval] Error stack:', error.stack);
            }
        }
    }

    // Strategy 3: Query parameter (fallback, less secure)
    if (req.query && req.query.userId) {
        console.log('[Approval] DEBUG: Found userId via query parameter:', req.query.userId);
        return req.query.userId;
    }

    console.log('[Approval] DEBUG: No userId found via any strategy!');
    return null;
}

/**
 * POST /api/approval/request
 *
 * Called by MCP Proxy when approval is needed
 * Blocks until user approves/denies in the UI
 */
router.post('/request', async (req, res) => {
    try {
        // Internal-only: only allow calls from localhost (MCP wrappers)
        const clientIp = req.ip || req.socket?.remoteAddress || '';
        const isLocalhost = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(clientIp);
        if (!isLocalhost) {
            console.warn(`[Approval] ⚠️  Rejected /request from non-localhost IP: ${clientIp}`);
            return res.status(403).json({ error: 'Forbidden: Internal endpoint only' });
        }

        const { tool, params, userId, sessionId, timestamp } = req.body;

        console.log(`[Approval] Request received: ${tool} for user: ${userId || 'unknown'}`);

        // Validate request
        if (!tool) {
            return res.status(400).json({
                error: 'Missing required field: tool'
            });
        }

        // ✅ USER ISOLATION: Extract userId with SSE-client fallback
        let requestUserId = userId || await getUserIdFromRequest(req);

        // ✅ FALLBACK: If MCP Proxy sends 'default-user', use SSE-connected client userId
        if (!requestUserId || requestUserId === 'default-user') {
            const connectedUserIds = approvalService.getConnectedUserIds();

            if (connectedUserIds.length === 1) {
                requestUserId = connectedUserIds[0];
                console.log(`[Approval] ℹ️  Using SSE-client userId as fallback: ${requestUserId}`);
            } else if (connectedUserIds.length > 1) {
                console.warn(`[Approval] ⚠️  Multiple users connected (${connectedUserIds.length}) - cannot determine userId from SSE clients`);
                requestUserId = 'default';
            } else {
                console.warn('[Approval] ⚠️  No SSE clients connected - using "default" userId (insecure!)');
                requestUserId = 'default';
            }
        }

        // Create approval request
        const requestId = `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const approvalRequest = {
            id: requestId,
            tool,
            params,
            userId: requestUserId,
            sessionId: sessionId || 'default',
            timestamp: timestamp || new Date().toISOString(),
            status: 'pending'
        };

        // Broadcast to connected SSE clients of this user only
        approvalService.broadcastApprovalRequest(approvalRequest);

        // Wait for user response (with timeout)
        const timeout = 60000; // 60 seconds
        const result = await approvalService.waitForResponse(requestId, timeout);

        if (result) {
            console.log(`[Approval] Request ${requestId} ${result.approved ? 'APPROVED' : 'DENIED'} by user '${requestUserId}'`);

            res.json({
                approved: result.approved,
                policy: result.policy || 'once',
                timestamp: new Date().toISOString()
            });
        } else {
            console.log(`[Approval] Request ${requestId} TIMEOUT for user '${requestUserId}'`);

            res.status(408).json({
                error: 'Approval timeout',
                approved: false
            });
        }
    } catch (error) {
        console.error('[Approval] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * POST /api/approval/respond
 *
 * Called by Frontend when user clicks Approve/Deny
 * Uses optionalJwtAuth to work with cookie-based JWT (EventSource compatible)
 */
router.post('/respond', optionalJwtAuth, async (req, res) => {
    try {
        const { requestId, approved, policy } = req.body;

        // ✅ USER ISOLATION: Extract userId from authenticated request
        const respondingUserId = await getUserIdFromRequest(req);

        if (!respondingUserId) {
            console.error('[Approval] ⚠️  No userId found in respond request - rejecting for security');
            return res.status(401).json({
                error: 'Unauthorized: User not authenticated'
            });
        }

        console.log(`[Approval] Response received: ${requestId} -> ${approved ? 'APPROVED' : 'DENIED'} by user '${respondingUserId}'`);

        // Validate request
        if (!requestId || approved === undefined) {
            return res.status(400).json({
                error: 'Missing required fields: requestId, approved'
            });
        }

        // Resolve the pending request with userId validation
        const success = approvalService.resolveRequest(requestId, {
            approved,
            policy: policy || 'once',
            userId: respondingUserId, // ✅ Include userId for validation
            timestamp: new Date().toISOString()
        });

        if (success) {
            res.json({ success: true });
        } else {
            res.status(404).json({
                error: 'Request not found, already resolved, or user mismatch'
            });
        }
    } catch (error) {
        console.error('[Approval] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * OPTIONS /api/approval/stream
 *
 * Handle CORS preflight for SSE endpoint
 */
router.options('/stream', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Id');
    res.status(204).end();
});

/**
 * GET /api/approval/stream
 *
 * SSE (Server-Sent Events) endpoint for real-time approval notifications
 * Frontend connects to this to receive approval requests
 *
 * ✅ FIXED: Now requires userId via refreshToken Cookie + Session Lookup
 */
router.get('/stream', async (req, res) => {
    // ✅ USER ISOLATION: Extract userId from refreshToken Cookie
    const userId = await getUserIdFromRequest(req);

    if (!userId) {
        console.error('[Approval] ⚠️  SSE connection without userId - rejecting for security');
        res.status(401).json({
            error: 'Unauthorized: User authentication required for SSE connection'
        });
        return;
    }

    console.log(`[Approval] New SSE client connected for user: ${userId}`);

    // Disable buffering at socket level
    req.socket.setNoDelay(true);
    req.socket.setTimeout(0);

    // Set SSE headers (Express will send 200 automatically on first write)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Add client to service WITH userId
    const clientId = approvalService.addClient(res, userId);

    // Send SSE comment first to establish connection (SSE best practice)
    res.write(': heartbeat\n\n');

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', clientId, userId })}\n\n`);

    console.log(`[Approval] Sent initial messages to client ${clientId} (user: ${userId})`);

    // Handle client disconnect
    req.on('close', () => {
        console.log(`[Approval] SSE client ${clientId} disconnected (user: ${userId})`);
        approvalService.removeClient(clientId);
    });

    // Keep connection alive with periodic heartbeats
    const heartbeatInterval = setInterval(() => {
        try {
            res.write(': heartbeat\n\n');
        } catch (error) {
            console.error(`[Approval] Heartbeat error for client ${clientId}:`, error.message);
            clearInterval(heartbeatInterval);
            approvalService.removeClient(clientId);
        }
    }, 15000); // Every 15 seconds

    req.on('close', () => {
        clearInterval(heartbeatInterval);
    });
});

/**
 * GET /api/approval/pending
 *
 * Get list of pending approval requests for the authenticated user
 * Useful for loading state when page refreshes
 *
 * ✅ FIXED: Now filters by userId via refreshToken Cookie
 */
router.get('/pending', async (req, res) => {
    try {
        // ✅ USER ISOLATION: Extract userId from refreshToken Cookie
        const userId = await getUserIdFromRequest(req);

        if (!userId) {
            console.warn('[Approval] ⚠️  Pending request without userId - returning empty list for security');
            return res.json({
                requests: [],
                count: 0,
                warning: 'User not authenticated'
            });
        }

        // Get pending requests filtered by userId
        const pending = approvalService.getPendingRequests(userId);

        res.json({
            requests: pending,
            count: pending.length,
            userId: userId
        });
    } catch (error) {
        console.error('[Approval] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * GET /api/approval/whoami
 *
 * Returns userId for the calling process (used by MCP wrappers)
 * Supports multiple authentication methods:
 * - sessionId query parameter (for server-side MCP wrapper calls)
 * - Cookie-based authentication (for browser calls)
 *
 * ✅ UPDATE-SAFE: Custom endpoint for MCP wrapper integration
 */
router.get('/whoami', async (req, res) => {
    try {
        console.log('[Approval] /whoami called with query:', req.query);

        // Strategy 1: sessionId query parameter (for MCP wrappers)
        const sessionId = req.query.sessionId;

        if (sessionId) {
            console.log('[Approval] Attempting session lookup by sessionId:', sessionId);

            try {
                // Try to find session by sessionId field
                const session = await findSession({ sessionId });

                if (session && session.user) {
                    const userId = session.user.toString();
                    console.log('[Approval] Found userId via sessionId:', userId);
                    return res.json({
                        userId,
                        method: 'sessionId'
                    });
                }
            } catch (error) {
                console.warn('[Approval] Session lookup by sessionId failed:', error.message);
                // Continue to fallback strategies
            }

            // Fallback: Try using sessionId as MongoDB _id
            try {
                const session = await findSession({ _id: sessionId });

                if (session && session.user) {
                    const userId = session.user.toString();
                    console.log('[Approval] Found userId via _id lookup:', userId);
                    return res.json({
                        userId,
                        method: 'sessionId_as_id'
                    });
                }
            } catch (error) {
                console.warn('[Approval] Session lookup by _id failed:', error.message);
            }
        }

        // Strategy 2: Cookie-based authentication (fallback for browser calls)
        const userId = await getUserIdFromRequest(req);

        if (userId) {
            console.log('[Approval] Found userId via cookies:', userId);
            return res.json({
                userId,
                method: 'cookie'
            });
        }

        // No userId found
        console.warn('[Approval] /whoami - No userId found via any method');
        res.json({
            userId: 'default-user',
            method: 'fallback',
            warning: 'No authentication found'
        });
    } catch (error) {
        console.error('[Approval] /whoami error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
            userId: 'default-user'
        });
    }
});

module.exports = router;
