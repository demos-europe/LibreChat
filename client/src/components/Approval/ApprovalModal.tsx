/**
 * Approval Modal Component
 * File: client/src/components/Approval/ApprovalModal.tsx
 *
 * Displays approval requests from MCP Proxy in a modal dialog
 * Allows user to approve/deny with optional "remember" policies
 */

import React, { useState } from 'react';
import { X, AlertTriangle, Info } from 'lucide-react';

interface ApprovalRequest {
  id: string;
  tool: string;
  params: Record<string, any>;
  userId: string;
  sessionId: string;
  timestamp: string;
  status: string;
}

interface ApprovalModalProps {
  request: ApprovalRequest | null;
  onApprove: (policy: 'once' | 'session' | 'always') => void;
  onDeny: () => void;
  onClose: () => void;
}

export const ApprovalModal: React.FC<ApprovalModalProps> = ({
  request,
  onApprove,
  onDeny,
  onClose,
}) => {
  const [policy, setPolicy] = useState<'once' | 'session' | 'always'>('once');
  const [showDetails, setShowDetails] = useState(false);

  if (!request) return null;

  // Determine danger level based on operation type
  const toolLower = request.tool.toLowerCase();

  // CRITICAL: Direct execution or destructive operations
  const isCritical = toolLower.includes('delete') ||
                     toolLower.includes('remove') ||
                     toolLower.includes('drop') ||
                     toolLower.includes('destroy') ||
                     toolLower.includes('kill') ||
                     toolLower.includes('terminate');

  // HIGH: Write/Execute operations that modify system state
  const isHighRisk = toolLower.includes('bash') ||
                     toolLower.includes('exec') ||
                     toolLower.includes('execute') ||
                     toolLower.includes('run') ||
                     toolLower.includes('write') ||
                     toolLower.includes('create') ||
                     toolLower.includes('update') ||
                     toolLower.includes('modify') ||
                     toolLower.includes('edit') ||
                     toolLower.includes('commit') ||
                     toolLower.includes('push');

  const isDangerous = isCritical || isHighRisk;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden border border-gray-200 dark:border-gray-700 animate-slide-in-up">
        {/* Header with gradient based on danger level */}
        <div className={`p-6 border-b ${
          isCritical
            ? 'border-red-200 dark:border-red-900/50 bg-gradient-to-br from-red-50 via-red-50 to-rose-50 dark:from-red-950/40 dark:via-red-900/30 dark:to-rose-900/30'
            : isDangerous
            ? 'border-orange-200 dark:border-orange-900/50 bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-950/30 dark:via-amber-900/20 dark:to-yellow-900/20'
            : 'border-gray-200 dark:border-gray-700 bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 dark:from-green-950/20 dark:via-emerald-900/15 dark:to-teal-900/15'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                isCritical
                  ? 'bg-red-100 dark:bg-red-900/40'
                  : isDangerous
                  ? 'bg-orange-100 dark:bg-orange-900/40'
                  : 'bg-green-100 dark:bg-green-900/40'
              }`}>
                {isDangerous ? (
                  <AlertTriangle className={isCritical ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'} size={24} />
                ) : (
                  <Info className="text-green-600 dark:text-green-400" size={24} />
                )}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {isCritical ? '⚠️ Critical Operation' : isDangerous ? 'Approval Required' : 'Permission Request'}
                </h2>
                <p className={`text-sm mt-1 ${
                  isCritical
                    ? 'text-red-700 dark:text-red-300 font-medium'
                    : isDangerous
                    ? 'text-orange-700 dark:text-orange-300'
                    : 'text-gray-600 dark:text-gray-400'
                }`}>
                  {isCritical ? 'This operation can permanently modify or delete data' : 'Claude wants to execute an MCP tool'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {/* Tool Information with danger indicator */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Tool Name
              </h3>
              {isDangerous && (
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  isCritical
                    ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                    : 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800'
                }`}>
                  {isCritical ? '🔴 Critical' : '⚠️ Write/Execute'}
                </span>
              )}
            </div>
            <div className={`rounded-lg p-3 border ${
              isCritical
                ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50'
                : isDangerous
                ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900/50'
                : 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
            }`}>
              <code className={`text-sm font-mono font-semibold ${
                isCritical
                  ? 'text-red-700 dark:text-red-300'
                  : isDangerous
                  ? 'text-orange-700 dark:text-orange-300'
                  : 'text-gray-900 dark:text-gray-100'
              }`}>
                {request.tool}
              </code>
            </div>
          </div>

          {/* Parameters */}
          {Object.keys(request.params || {}).length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Parameters
                </h3>
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {showDetails ? 'Hide Details' : 'Show Details'}
                </button>
              </div>

              {showDetails ? (
                <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3 max-h-64 overflow-y-auto">
                  <pre className="text-xs text-gray-900 dark:text-gray-100 font-mono whitespace-pre-wrap">
                    {JSON.stringify(request.params, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {Object.keys(request.params).length} parameter(s)
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Policy Selection */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Remember my choice
            </h3>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer transition">
                <input
                  type="radio"
                  name="policy"
                  value="once"
                  checked={policy === 'once'}
                  onChange={(e) => setPolicy('once')}
                  className="w-4 h-4 text-blue-600"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    Just this time
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Ask me again next time
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer transition">
                <input
                  type="radio"
                  name="policy"
                  value="session"
                  checked={policy === 'session'}
                  onChange={(e) => setPolicy('session')}
                  className="w-4 h-4 text-blue-600"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    For this conversation
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Remember for this session only
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer transition">
                <input
                  type="radio"
                  name="policy"
                  value="always"
                  checked={policy === 'always'}
                  onChange={(e) => setPolicy('always')}
                  className="w-4 h-4 text-blue-600"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    Always allow
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Never ask me again for this tool
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Warning banner for dangerous operations */}
          {isDangerous && (
            <div className={`rounded-lg p-4 mb-4 border ${
              isCritical
                ? 'bg-gradient-to-br from-red-50 via-red-50 to-rose-50 dark:from-red-950/40 dark:via-red-900/30 dark:to-rose-900/30 border-red-300 dark:border-red-800'
                : 'bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-950/30 dark:via-amber-900/20 dark:to-yellow-900/20 border-orange-300 dark:border-orange-800'
            }`}>
              <div className="flex gap-3">
                <div className={`p-1.5 rounded-lg flex-shrink-0 ${
                  isCritical
                    ? 'bg-red-100 dark:bg-red-900/40'
                    : 'bg-orange-100 dark:bg-orange-900/40'
                }`}>
                  <AlertTriangle className={isCritical ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'} size={20} />
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-semibold mb-1 ${
                    isCritical
                      ? 'text-red-900 dark:text-red-200'
                      : 'text-orange-900 dark:text-orange-200'
                  }`}>
                    {isCritical ? '⚠️ CRITICAL: Destructive Operation' : '⚠️ Write/Execute Permission Required'}
                  </p>
                  <p className={`text-xs ${
                    isCritical
                      ? 'text-red-800 dark:text-red-300'
                      : 'text-orange-800 dark:text-orange-300'
                  }`}>
                    {isCritical
                      ? 'This operation can permanently delete or destroy data. Ensure you understand the consequences before approving.'
                      : 'This operation will execute code or modify system state. Review the parameters carefully before approving.'
                    }
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className={`p-6 border-t bg-gray-50 dark:bg-gray-750 ${
          isCritical
            ? 'border-red-200 dark:border-red-900/50'
            : isDangerous
            ? 'border-orange-200 dark:border-orange-900/50'
            : 'border-gray-200 dark:border-gray-700'
        }`}>
          <div className="flex gap-3 justify-end">
            <button
              onClick={onDeny}
              className="px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-all duration-200 shadow-sm hover:shadow"
            >
              Deny
            </button>
            <button
              onClick={() => onApprove(policy)}
              className={`px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-all duration-200 shadow-sm hover:shadow-md ${
                isCritical
                  ? 'bg-gradient-to-br from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 ring-2 ring-red-300 dark:ring-red-900/50'
                  : isDangerous
                  ? 'bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 ring-2 ring-orange-300 dark:ring-orange-900/50'
                  : 'bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800'
              }`}
            >
              {isCritical ? '⚠️ Approve Critical Operation' : isDangerous ? 'Approve Execution' : 'Approve'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
