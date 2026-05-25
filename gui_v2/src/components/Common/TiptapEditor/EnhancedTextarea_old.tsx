import { TextArea } from '@radix-ui/themes/components/text-area';
import Fuse from 'fuse.js';
import debounce from 'lodash/debounce';
import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWineContext } from '../../../context/WineContext/WineProvider';

const TiptapEditor_old = ({ onChange, value, disabled, ...props }) => {
    const wineNames = useWineContext();

    const [input, setInput] = useState('');
    const [filteredWords, setFilteredWords] = useState([]);
    const [showPopover, setShowPopover] = useState(false);
    const [mentionStart, setMentionStart] = useState(null);
    const textareaRef = useRef(null);
    const popoverRef = useRef(null);

    const fuse = useMemo(
        () =>
            new Fuse(wineNames ?? [], {
                includeScore: true,
                threshold: 0.2,
            }),
        [wineNames]
    );

    const searchWines = useCallback(
        debounce((query, cursorPosition) => {
            if (!query || query.length < 3) return [];

            const { mentionText, mentionStart } = detectMention(query, cursorPosition);
            console.log(`mentionText: [${mentionText}] mentionStart: [${mentionStart}]`);

            if (mentionText !== null) {
                const matches = fuse.search(mentionText);
                matches.forEach((match) => console.log('match : ', match));

                if (matches.length > 0) {
                    setFilteredWords(matches);
                    setMentionStart(mentionStart);
                    setShowPopover(true);
                } else {
                    setShowPopover(false);
                }
            } else {
                setShowPopover(false);
            }
        }, 500), // Adjust debounce delay (in ms) based on UI responsiveness
        [fuse]
    );

    const detectMention = (text, cursorPosition) => {
        const mentionRegex = /@([\p{L}\d\s_]*)/gu;
        let match;
        let mentionStart = null;
        let mentionText = null;

        while ((match = mentionRegex.exec(text)) !== null) {
            const matchStart = match.index;
            const matchEnd = matchStart + match[0].length;

            // If the cursor is inside this mention, extract it
            if (cursorPosition >= matchStart && cursorPosition <= matchEnd) {
                mentionText = match[1]; // Extract text after "@"
                mentionStart = matchStart;
                break;
            }
        }

        return { mentionText, mentionStart };
    };

    const handleChange = (e) => {
        const value = e.target.value;
        onChange?.(e);
        setInput(value);
        const cursorPosition = e.target.selectionStart;
        searchWines(value, cursorPosition);
    };

    const handleSelect = (wineName) => {
        if (mentionStart === null) return;

        const beforeMention = input.substring(0, mentionStart);
        const afterMention = input.substring(mentionStart).replace(/@\S*/, `@${wineName} `);
        const event = {
            target: {
                value: beforeMention + afterMention,
            },
        } as React.ChangeEvent<HTMLTextAreaElement>;

        onChange?.(event);
        setInput(beforeMention + afterMention);
        setShowPopover(false);
    };
    /** Hide popover when clicking outside */
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                textareaRef.current &&
                !textareaRef.current.contains(event.target) &&
                popoverRef.current &&
                !popoverRef.current.contains(event.target)
            ) {
                setShowPopover(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        // <div style={{ position: 'relative', width: '100%' }}>
        //     <TextArea
        //         color="gold"
        //         ref={textAreaRef}
        //         resize="both"
        //         onChange={handleTextChange}
        //         onSelect={handleTextChange}
        //         onKeyUp={handleTextChange}
        //         onScroll={handleScroll} // Added scroll handler
        //         value={value.toString()}
        //         className="min-h-32"
        //         disabled={disabled}
        //     />
        //     <SuggestionBubble
        //         suggestion={suggestion}
        //         onSelect={handleSuggestionSelect}
        //         tooltipRef={tooltipRef}
        //         caretPosition={{
        //             x: `${caretPosition.x}px`, // Convert to string with px only when passing to component
        //             y: `${caretPosition.y}px`,
        //         }}
        //     />
        // </div>
        <div className="relative w-full">
            <TextArea
                ref={textareaRef}
                value={value.toString()}
                onChange={handleChange}
                className="w-full border p-2"
                placeholder="Type here..."
                disabled={disabled}
            />
            {showPopover && (
                <div
                    ref={popoverRef}
                    className="absolute left-0 mt-2 bg-white border shadow-md rounded-md p-2 w-80 max-h-48 overflow-y-auto z-50">
                    {filteredWords.map((word, i) => (
                        <div
                            key={i}
                            onClick={() => handleSelect(word.item)}
                            className="p-2 hover:bg-gray-200 cursor-pointer rounded-md">
                            {word.item}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

TiptapEditor_old.displayName = 'TiptapEditor_old';
export { TiptapEditor_old };
