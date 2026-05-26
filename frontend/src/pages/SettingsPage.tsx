import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlagGR } from '@/assets/flags/FlagGR';
import { FlagUK } from '@/assets/flags/FlagUS';
import { PageRule } from '@/components/Common/PageRule';

const langs = [
  {
    value: 'el',
    flag: <FlagGR />,
    label: 'Ελληνικά',
  },
  {
    value: 'en',
    flag: <FlagUK />,
    label: 'English',
  },
];

export const SettingsPage = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full w-full overflow-y-scroll hide-scrollbar max-w-5xl mx-auto px-1">
      <PageRule label={t('settings_header')} />
      <div className="flex justify-between items-center">
        <p className="text-sm">{t('select_lang')}</p>
        <LanguageSelector />
      </div>
    </div>
  );
};

const LanguageSelector = () => {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(i18n.language);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-[200px] justify-between">
          <div className="flex items-center gap-2">
            {langs?.find(fl => fl?.value === i18n?.language)?.flag}
            {value ? langs.find(framework => framework.value === value)?.label : t('select_language')}
          </div>
          <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder={t('select_lang')} />
          <CommandList>
            <CommandEmpty>{t('no_framework_found')}</CommandEmpty>
            <CommandGroup>
              {langs.map(lang => (
                <CommandItem
                  key={lang.value}
                  value={lang.value}
                  onSelect={currentValue => {
                    setValue(currentValue === value ? '' : currentValue);
                    i18n.changeLanguage(lang.value);
                    localStorage.setItem('selectedLanguage', lang.value);
                    setOpen(false);
                  }}
                >
                  {lang.flag}
                  {lang.label}
                  <CheckIcon className={cn('mr-2 h-4 w-4', value === lang.value ? 'opacity-100' : 'opacity-0')} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
