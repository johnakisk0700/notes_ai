import './MentionList.scss';
import { type FC, forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

type MentionListProps = {
  items: string[];
  command: ({ id }: { id: string }) => void;
};

export const MentionList: FC<MentionListProps> = forwardRef(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectItem = index => {
    const item = items[index];

    if (item) {
      command({ id: item });
    }
  };

  const upHandler = () => {
    setSelectedIndex((selectedIndex + items.length - 1) % items.length);
  };

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % items.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => setSelectedIndex(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        upHandler();
        return true;
      }

      if (event.key === 'ArrowDown') {
        downHandler();
        return true;
      }

      if (event.key === 'Enter') {
        enterHandler();
        return true;
      }

      return false;
    },
  }));

  useEffect(() => {
    const currentItem = itemRefs.current[selectedIndex];
    if (currentItem) {
      currentItem.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [selectedIndex]);
  return (
    <div className="dropdown-menu">
      {items.length ? (
        items.map((item, index) => (
          <button
            ref={el => { itemRefs.current[index] = el; }}
            className={index === selectedIndex ? 'is-selected' : ''}
            key={index}
            onClick={() => selectItem(index)}
          >
            {item}
          </button>
        ))
      ) : (
        <div className="item">No result</div>
      )}
    </div>
  );
});
