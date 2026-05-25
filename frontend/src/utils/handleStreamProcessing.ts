export async function handleStreamProcessing(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  callbacks: {
    onData: (data: string) => void;
    onErrorEvent: (errorMessage: string) => void;
    onDoneEvent: () => void;
    onManualEvent?: (manualData: string) => void;
    onThreadEvent?: (threadId: string) => void;
  }
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let eolIndex;
    while ((eolIndex = buffer.indexOf('\n\n')) >= 0) {
      const message = buffer.slice(0, eolIndex);
      buffer = buffer.slice(eolIndex + 2);

      if (message.startsWith('data: ')) {
        // Handle multiple consecutive escaped newlines to preserve paragraph spacing
        const decodedData = message.substring(6).replace(/(\\n)+/g, match => {
          // Convert each \\n to \n, preserving the count
          return '\n'.repeat(match.length / 2);
        });
        callbacks.onData(decodedData);
      } else if (message.startsWith('event: error\ndata: ')) {
        callbacks.onManualEvent?.('');
        callbacks.onErrorEvent(message.substring(20) || 'An unknown error occurred');
        return;
      } else if (message.startsWith('event: done')) {
        callbacks.onManualEvent?.('');
        callbacks.onDoneEvent();
        return;
      } else if (message.startsWith('event: thread\ndata: ')) {
        // Server created a thread for this turn; carries its id so the client
        // can route to /thread/:id and refresh the sidebar.
        callbacks.onThreadEvent?.(message.substring('event: thread\ndata: '.length));
      } else if (message.startsWith('manual: ')) {
        callbacks.onManualEvent?.(message.substring(8));
      }
    }
  }
  // If the stream ends naturally without an explicit 'done' or 'error' event from the server
  // that caused an early return, this function will complete.
  // The 'finally' block in startTextStream will handle setIsStreaming(false).
}
