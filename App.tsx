import React, { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Message,
  IncomingMessagePayload,
  OutgoingResponsePayload,
  ExtractedIntelligence,
  HoneypotSession,
  FinalResultPayload,
} from './types';
import {
  detectScamIntent,
  generateAgentResponse,
  extractIntelligence,
  generateAgentNotes,
} from './services/geminiService';
import {
  EVALUATION_ENDPOINT,
  DEFAULT_NON_SCAM_REPLY,
  AGENT_PERSONA_DESCRIPTION,
  HONEYPOT_EXTERNAL_API_PATH,
  HONEYPOT_API_KEY_HEADER,
  HONEYPOT_DEV_API_KEY,
} from './constants';
import ConversationDisplay from './components/ConversationDisplay';
import ChatInput from './components/ChatInput';
import ExtractedIntelligencePanel from './components/ExtractedIntelligencePanel';
import ScamStatusIndicator from './components/ScamStatusIndicator';
import EngagementControls from './components/EngagementControls';

// Utility to create an initial empty intelligence object
const createEmptyIntelligence = (): ExtractedIntelligence => ({
  bankAccounts: [],
  upiIds: [],
  phishingLinks: [],
  phoneNumbers: [],
  suspiciousKeywords: [],
});

const App: React.FC = () => {
  const [session, setSession] = useState<HoneypotSession>(() => {
    const savedSession = localStorage.getItem('honeypotSession');
    if (savedSession) {
      const parsedSession = JSON.parse(savedSession);
      return {
        ...parsedSession,
        extractedIntelligence: parsedSession.extractedIntelligence || createEmptyIntelligence(),
        scamType: parsedSession.scamType || null,
        agentNotes: parsedSession.agentNotes || '',
        status: parsedSession.status || 'active',
      };
    }
    return {
      sessionId: uuidv4(),
      conversationHistory: [],
      scamDetected: false,
      totalMessagesExchanged: 0,
      extractedIntelligence: createEmptyIntelligence(),
      agentNotes: '',
      scamType: null,
      status: 'active',
    };
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persist session state to localStorage
  useEffect(() => {
    localStorage.setItem('honeypotSession', JSON.stringify(session));
  }, [session]);

  // Core logic for processing an incoming message and generating a response
  const processHoneypotLogic = useCallback(async (
    currentSession: HoneypotSession,
    scammerMessageText: string,
  ): Promise<{ apiResponse: OutgoingResponsePayload; updatedSessionState: HoneypotSession }> => {
    let agentReply = '';
    let newScamDetected = currentSession.scamDetected;
    let newScamType = currentSession.scamType;

    // Add scammer's message to history first
    const updatedHistory: Message[] = [
      ...currentSession.conversationHistory,
      { sender: 'scammer', text: scammerMessageText, timestamp: Date.now() },
    ];

    // Step 1: Detect scam intent or generate agent response
    if (!currentSession.scamDetected) {
      const detectionResult = await detectScamIntent(scammerMessageText, updatedHistory);
      newScamDetected = detectionResult.isScam;
      newScamType = detectionResult.scamType;
      agentReply = detectionResult.isScam ? detectionResult.initialReply : DEFAULT_NON_SCAM_REPLY;
    } else {
      // If scam already detected, generate a multi-turn agent response
      const response = await generateAgentResponse(updatedHistory, AGENT_PERSONA_DESCRIPTION);
      agentReply = response.reply;
    }

    // Add agent's reply to history
    const finalHistory: Message[] = [
      ...updatedHistory,
      { sender: 'honeypot', text: agentReply, timestamp: Date.now() },
    ];

    // Step 2: Extract intelligence (always run after each turn if scam detected)
    let extractedData = currentSession.extractedIntelligence;
    if (newScamDetected) {
      extractedData = await extractIntelligence(finalHistory);
    }

    const updatedSessionState: HoneypotSession = {
      ...currentSession,
      conversationHistory: finalHistory,
      scamDetected: newScamDetected,
      scamType: newScamType,
      totalMessagesExchanged: currentSession.totalMessagesExchanged + 2, // Scammer + Agent
      extractedIntelligence: extractedData,
    };

    const apiResponse: OutgoingResponsePayload = {
      status: 'success',
      reply: agentReply,
      scamDetected: newScamDetected,
    };

    return { apiResponse, updatedSessionState };
  }, [session.conversationHistory, session.scamDetected, session.scamType]); // Removed 'session' from dependencies to avoid stale closures. Added specific session properties.


  // Simulate a REST API endpoint
  const simulateHoneypotApiEndpoint = useCallback(async (
    request: { method: string; headers: Headers; json: () => Promise<IncomingMessagePayload> },
    currentSession: HoneypotSession
  ): Promise<{ status: number; body: OutgoingResponsePayload }> => {
    // 1. Validate HTTP Method
    if (request.method !== 'POST') {
      return { status: 405, body: { status: 'error', reply: 'Method Not Allowed' } };
    }

    // 2. Validate API Key
    const apiKey = request.headers.get(HONEYPOT_API_KEY_HEADER);
    if (!apiKey || apiKey !== HONEYPOT_DEV_API_KEY) {
      return { status: 401, body: { status: 'error', reply: 'Unauthorized: Invalid or missing API key' } };
    }

    // 3. Parse Request Body
    let payload: IncomingMessagePayload;
    try {
      payload = await request.json();
      if (!payload.sessionId || !payload.message?.text) {
        throw new Error('Missing sessionId or message text in payload');
      }
    } catch (parseError) {
      console.error('API Payload parsing error:', parseError);
      return { status: 400, body: { status: 'error', reply: 'Bad Request: Invalid JSON payload' } };
    }

    // 4. Process Logic
    try {
      const { apiResponse, updatedSessionState } = await processHoneypotLogic(
        currentSession,
        payload.message.text
      );
      // The updatedSessionState is returned here, but the actual React state update happens in handleIncomingMessage
      // This mimics a backend not directly manipulating client state.
      return { status: 200, body: apiResponse };
    } catch (logicError) {
      console.error('Honeypot API logic error:', logicError);
      return { status: 500, body: { status: 'error', reply: 'Internal Server Error during AI processing' } };
    }
  }, [processHoneypotLogic]);


  const handleIncomingMessage = useCallback(async (scammerMessageText: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Simulate an incoming API request
      const mockRequestHeaders = new Headers();
      mockRequestHeaders.append(HONEYPOT_API_KEY_HEADER, HONEYPOT_DEV_API_KEY);

      const mockIncomingPayload: IncomingMessagePayload = {
        sessionId: session.sessionId,
        message: {
          sender: 'scammer',
          text: scammerMessageText,
          timestamp: Date.now(),
        },
        conversationHistory: session.conversationHistory, // This is usually sent by the client for context
        metadata: {
          channel: 'UI-Simulated',
          language: 'English',
          locale: 'IN',
        },
      };

      // Call the simulated API endpoint
      const apiResponse = await simulateHoneypotApiEndpoint(
        {
          method: 'POST',
          headers: mockRequestHeaders,
          json: async () => mockIncomingPayload,
        },
        session // Pass the current session state to the simulated endpoint
      );

      if (apiResponse.status === 200 && apiResponse.body.status === 'success') {
        // Update session state based on the successful API response
        // Note: The simulated endpoint doesn't return the full updated session,
        // so we re-run some logic locally or reconstruct based on reply.
        // For simplicity and to ensure all local state is consistently updated:
        const { updatedSessionState } = await processHoneypotLogic(session, scammerMessageText);
        setSession(updatedSessionState);

      } else {
        // Handle API errors
        throw new Error(`API Error ${apiResponse.status}: ${apiResponse.body.reply}`);
      }
    } catch (err) {
      console.error('Honeypot UI interaction error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to process message: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [session, simulateHoneypotApiEndpoint, processHoneypotLogic]); // Added all necessary dependencies


  const handleEndEngagement = useCallback(async () => {
    if (session.status === 'completed' || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const agentNotesResult = await generateAgentNotes(session.conversationHistory);
      const finalNotes = agentNotesResult.notes;

      const finalPayload: FinalResultPayload = {
        sessionId: session.sessionId,
        scamDetected: session.scamDetected,
        totalMessagesExchanged: session.totalMessagesExchanged,
        extractedIntelligence: session.extractedIntelligence,
        agentNotes: finalNotes,
      };

      // Update session with final notes and status before sending
      setSession(prevSession => ({
        ...prevSession,
        agentNotes: finalNotes,
        status: 'completed',
      }));

      const response = await fetch(EVALUATION_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(finalPayload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to submit evaluation results: ${errorData.message || response.statusText}`);
      }

      alert('Engagement results submitted successfully!');
    } catch (err) {
      console.error('Error ending engagement:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to submit final results: ${errorMessage}`);
      // Revert status if submission fails
      setSession(prevSession => ({ ...prevSession, status: 'active' }));
    } finally {
      setIsLoading(false);
    }
  }, [session, isLoading]);

  const handleResetSession = useCallback(() => {
    if (isLoading) return; // Prevent reset during an active operation
    const confirmReset = window.confirm('Are you sure you want to reset the session? All current conversation and extracted data will be lost.');
    if (confirmReset) {
      localStorage.removeItem('honeypotSession');
      setSession({
        sessionId: uuidv4(),
        conversationHistory: [],
        scamDetected: false,
        totalMessagesExchanged: 0,
        extractedIntelligence: createEmptyIntelligence(),
        agentNotes: '',
        scamType: null,
        status: 'active',
      });
      setError(null);
      alert('Session reset successfully!');
    }
  }, [isLoading]);

  return (
    <div className="flex flex-col md:flex-row w-full max-w-7xl mx-auto h-full relative">
      <ScamStatusIndicator scamDetected={session.scamDetected} />

      {error && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md shadow-md z-50 animate-fade-in">
          <p className="font-bold">Error:</p>
          <p className="text-sm">{error}</p>
          <button
            className="ml-4 text-sm font-semibold text-red-600 hover:text-red-800"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Chat Interface */}
      <div className="flex flex-col w-full md:w-2/3 bg-gray-100 rounded-lg shadow-xl p-0 h-[80vh] md:h-[90vh]">
        <h1 className="text-3xl font-extrabold text-center text-gray-800 p-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-t-lg shadow-md">
          AI Honeypot for Scam Detection
        </h1>
        <ConversationDisplay messages={session.conversationHistory} isLoading={isLoading} />
        <ChatInput onSendMessage={handleIncomingMessage} isLoading={isLoading || session.status === 'completed'} />
        <EngagementControls
          onEndEngagement={handleEndEngagement}
          onResetSession={handleResetSession}
          engagementCompleted={session.status === 'completed'}
          isLoading={isLoading}
        />
      </div>

      {/* Extracted Intelligence Panel */}
      <div className="mt-8 md:mt-0 md:ml-8 w-full md:w-1/3">
        <ExtractedIntelligencePanel
          intelligence={session.extractedIntelligence}
          scamType={session.scamType}
          agentNotes={session.agentNotes}
        />
      </div>
    </div>
  );
};

export default App;