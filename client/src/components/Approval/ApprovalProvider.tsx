/**
 * Approval Context Provider - WITH USER ISOLATION FIX + TIMING FIX
 * File: client/src/components/Approval/ApprovalProvider.tsx
 *
 * Manages SSE connection to backend for real-time approval notifications
 * Provides approval context to child components
 *
 * CHANGES:
 * - Line 16: Added import of useAuthContext
 * - Line 57-58: Extract userId from AuthContext
 * - Line 73: Pass userId as query parameter in SSE connection URL
 * - Line 286-304: FIXED useEffect to wait for user object before connecting
 */

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { ApprovalModal } from './ApprovalModal';
import { useAuthContext } from '~/hooks/AuthContext';

interface ApprovalRequest {
  id: string;
  tool: string;
  params: Record<string, any>;
  userId: string;
  sessionId: string;
  timestamp: string;
  status: string;
}

interface ApprovalContextValue {
  currentRequest: ApprovalRequest | null;
  pendingRequests: ApprovalRequest[];
  isConnected: boolean;
  approveRequest: (requestId: string, policy: 'once' | 'session' | 'always') => Promise<void>;
  denyRequest: (requestId: string) => Promise<void>;
}

const ApprovalContext = createContext<ApprovalContextValue | undefined>(undefined);

export const useApprovalContext = () => {
  const context = useContext(ApprovalContext);
  if (!context) {
    throw new Error('useApprovalContext must be used within ApprovalProvider');
  }
  return context;
};

interface ApprovalProviderProps {
  children: React.ReactNode;
}

export const ApprovalProvider: React.FC<ApprovalProviderProps> = ({ children }) => {
  const [currentRequest, setCurrentRequest] = useState<ApprovalRequest | null>(null);
  const [pendingRequests, setPendingRequests] = useState<ApprovalRequest[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // CHANGED: Get userId from AuthContext for user isolation
  const { user } = useAuthContext();
  const userId = user?.id ?? null;

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Connect to SSE endpoint
  const connectToSSE = () => {
    console.log('[Approval] Connecting to SSE endpoint...');

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // CHANGED: Create new EventSource with userId query parameter for user isolation
    const eventSource = new EventSource(`/api/approval/stream?userId=${userId}`);

    console.log('[Approval] EventSource created:', eventSource);
    console.log('[Approval] EventSource readyState:', eventSource.readyState);
    console.log('[Approval] Connected with userId:', userId);

    eventSource.onopen = () => {
      console.log('[Approval] SSE connection established');
      console.log('[Approval] EventSource readyState after open:', eventSource.readyState);
      setIsConnected(true);

      // Fetch pending requests on connect
      fetchPendingRequests();
    };

    // Try BOTH onmessage and addEventListener to see which works
    eventSource.onmessage = (event) => {
      console.log('[Approval] onmessage TRIGGERED!', event);
      try {
        const message = JSON.parse(event.data);
        console.log('[Approval] SSE message received:', message.type);

        if (message.type === 'connected') {
          console.log('[Approval] Connected with clientId:', message.clientId);
        } else if (message.type === 'approval_request') {
          console.log('[Approval] New approval request:', message.data);
          handleNewRequest(message.data);
        }
      } catch (error) {
        console.error('[Approval] Error parsing SSE message:', error);
      }
    };

    eventSource.addEventListener('message', (event) => {
      console.log('[Approval] addEventListener message TRIGGERED!', event);
    });

    // Log ALL events
    eventSource.addEventListener('open', (event) => {
      console.log('[Approval] open event:', event);
    });

    eventSource.addEventListener('error', (event) => {
      console.log('[Approval] error event:', event);
    });

    eventSource.onerror = (error) => {
      console.error('[Approval] SSE connection error (onerror):', error);
      setIsConnected(false);
      eventSource.close();

      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('[Approval] Attempting to reconnect...');
        connectToSSE();
      }, 3000);
    };

    eventSourceRef.current = eventSource;
  };

  // Fetch pending requests
  const fetchPendingRequests = async () => {
    try {
      const response = await fetch('/api/approval/pending');
      const data = await response.json();

      console.log('[Approval] Fetched pending requests:', data.count);

      if (data.requests && data.requests.length > 0) {
        setPendingRequests(data.requests);

        // Show first pending request if no current request
        if (!currentRequest) {
          handleNewRequest(data.requests[0]);
        }
      }
    } catch (error) {
      console.error('[Approval] Error fetching pending requests:', error);
    }
  };

  // Handle new approval request
  const handleNewRequest = (request: ApprovalRequest) => {
    console.log('[Approval] Handling new request:', request.id);

    // Add to pending list if not already there
    setPendingRequests((prev) => {
      if (prev.some((r) => r.id === request.id)) {
        return prev;
      }
      return [...prev, request];
    });

    // Set as current request if none active
    if (!currentRequest) {
      setCurrentRequest(request);
      setShowModal(true);

      // Show browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification('Approval Required', {
          body: `Claude wants to execute: ${request.tool}`,
          icon: '/favicon.ico',
          requireInteraction: true,
        });

        notification.onclick = () => {
          window.focus();
        };
      }
    }
  };

  // Approve request
  const approveRequest = async (requestId: string, policy: 'once' | 'session' | 'always') => {
    try {
      console.log(`[Approval] Approving request ${requestId} with policy: ${policy}`);

      const response = await fetch('/api/approval/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestId,
          approved: true,
          policy,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to approve: ${response.statusText}`);
      }

      console.log('[Approval] Request approved successfully');

      // Remove from pending list
      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));

      // Clear current request and close modal
      setCurrentRequest(null);
      setShowModal(false);

      // Show next pending request if any
      setTimeout(() => {
        setPendingRequests((prev) => {
          if (prev.length > 0) {
            setCurrentRequest(prev[0]);
            setShowModal(true);
          }
          return prev;
        });
      }, 100);
    } catch (error) {
      console.error('[Approval] Error approving request:', error);
      alert('Failed to approve request. Please try again.');
    }
  };

  // Deny request
  const denyRequest = async (requestId: string) => {
    try {
      console.log(`[Approval] Denying request ${requestId}`);

      const response = await fetch('/api/approval/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestId,
          approved: false,
          policy: 'once',
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to deny: ${response.statusText}`);
      }

      console.log('[Approval] Request denied successfully');

      // Remove from pending list
      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));

      // Clear current request and close modal
      setCurrentRequest(null);
      setShowModal(false);

      // Show next pending request if any
      setTimeout(() => {
        setPendingRequests((prev) => {
          if (prev.length > 0) {
            setCurrentRequest(prev[0]);
            setShowModal(true);
          }
          return prev;
        });
      }, 100);
    } catch (error) {
      console.error('[Approval] Error denying request:', error);
      alert('Failed to deny request. Please try again.');
    }
  };

  // Close modal without responding
  const closeModal = () => {
    setShowModal(false);
    // Keep request in pending list
  };

  // Connect on mount
  useEffect(() => {
    if (!userId) return;

    console.log('[Approval] Connecting...');

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    connectToSSE();

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [userId]); // Re-run when userId becomes available or changes

  const contextValue: ApprovalContextValue = {
    currentRequest,
    pendingRequests,
    isConnected,
    approveRequest,
    denyRequest,
  };

  return (
    <ApprovalContext.Provider value={contextValue}>
      {children}
      {showModal && currentRequest && (
        <ApprovalModal
          request={currentRequest}
          onApprove={(policy) => approveRequest(currentRequest.id, policy)}
          onDeny={() => denyRequest(currentRequest.id)}
          onClose={closeModal}
        />
      )}
    </ApprovalContext.Provider>
  );
};

