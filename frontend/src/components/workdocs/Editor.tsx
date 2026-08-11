import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { Loader2, PlusSquare } from 'lucide-react';
import { TaskNode } from './TaskNode';
import { useLocalization } from "@/contexts/LocalizationContext";
import { API_BASE_URL, fetchWithAuth } from '@/lib/apiClient';

interface EditorProps {
  documentId: string;
  projectId: string;
  templateType?: string;
}

// Generate random color for cursor
const colors = ['#958DF1', '#F98181', '#FBCE76', '#8CE99A', '#74C0FC', '#B197FC'];
const getRandomColor = () => colors[Math.floor(Math.random() * colors.length)];

export default function WorkDocsEditor({ documentId, projectId, templateType = 'empty' }: EditorProps) {
  const { t } = useLocalization();
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);

  // Memoize ydoc so it survives React StrictMode remounts
  const [ydoc] = useState(() => new Y.Doc());

  // Memoize userInfo to prevent Tiptap unecessary re-renders
  const [userInfo] = useState(() => ({
    name: `${t('workdocs.user')} ${Math.floor(Math.random() * 1000)}`,
    color: getRandomColor(),
  }));



  useEffect(() => {
    let hpProvider: HocuspocusProvider | null = null;
    let cancelled = false;

    const connect = async () => {
      const response = await fetchWithAuth(`${API_BASE_URL}/auth/realtime-token`);
      if (!response.ok || cancelled) return;
      const { token } = await response.json();
      if (!token || cancelled) return;
      hpProvider = new HocuspocusProvider({
        url: process.env.NEXT_PUBLIC_YJS_URL || 'ws://localhost:1234',
        name: documentId,
        document: ydoc,
        token,
      });
      setProvider(hpProvider);
    };
    void connect();

    return () => {
      cancelled = true;
      hpProvider?.destroy();
    };
  }, [documentId, ydoc]);

  if (!provider || !ydoc || !userInfo) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="animate-spin w-5 h-5" />
          <span>{t('workdocs.connecting')}</span>
        </div>
      </div>
    );
  }

  return <WorkDocsEditorCore projectId={projectId} provider={provider} ydoc={ydoc} templateType={templateType} />;
}

function WorkDocsEditorCore({ projectId, provider, ydoc, templateType }: { projectId: string, provider: HocuspocusProvider, ydoc: Y.Doc, templateType: string }) {
  const { t } = useLocalization();
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // @ts-expect-error Tiptap types mismatch
        history: false,
      }),
      Collaboration.configure({
        document: ydoc,
      }),
      TaskNode.configure({
        projectId: projectId,
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[500px] p-8 bg-card shadow-sm border border-border rounded-lg',
      },
    },
  });

  useEffect(() => {
    if (!editor) return;

    const handleSync = () => {
      if (editor.isEmpty && templateType !== 'empty') {
        let content = '';
        if (templateType === 'prd') {
          content = `
            <h2>${t('workdocs.prdTitle')} (PRD) 🚀</h2>
            <h3>${t('workdocs.goal')}</h3>
            <p>${t('workdocs.goalDescription')}</p>
            <h3>${t('workdocs.userStories')}</h3>
            <ul>
              <li>${t('workdocs.userStoryPrompt')}</li>
            </ul>
            <h3>${t('workdocs.proposedTasks')}</h3>
            <p>${t('workdocs.addTasksPrompt')}</p>
            <p></p>
          `;
        } else if (templateType === 'meeting') {
          content = `
            <h2>${t('workdocs.meetingNotes')} 🤝</h2>
            <h3>${t('workdocs.dateAndAttendees')}</h3>
            <ul>
              <li>${t('workdocs.dateLabel')} </li>
              <li>${t('workdocs.attendeesLabel')} </li>
            </ul>
            <h3>${t('workdocs.agenda')}</h3>
            <ol>
              <li>${t('workdocs.agendaItem')}</li>
            </ol>
            <h3>${t('workdocs.actionItems')}</h3>
            <p>${t('workdocs.meetingTasks')}</p>
            <p></p>
          `;
        } else if (templateType === 'tech_spec') {
          content = `
            <h2>${t('workdocs.technicalSpec')} 💻</h2>
            <h3>${t('workdocs.introduction')}</h3>
            <p>${t('workdocs.architectureDescription')}</p>
            <h3>${t('workdocs.databaseSchema')}</h3>
            <p>...</p>
            <h3>${t('workdocs.apiRoutes')}</h3>
            <p>...</p>
          `;
        }
        if (content) {
          editor.commands.setContent(content);
        }
      }
    };

    provider.on('synced', handleSync);

    return () => {
      provider.off('synced', handleSync);
    };
  }, [editor, provider, templateType, t]);

  if (!editor) {
    return null;
  }

  return (
    <div className="relative h-full flex flex-col w-full">
      {/* Editor Content Area */}
      <div className="flex-1 overflow-y-auto bg-background p-8 pt-4">
        <div className="max-w-4xl mx-auto relative">

          {editor && (
            <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md shadow-sm border border-border rounded-lg p-2 mb-4 flex gap-2">
              <button
                onClick={() => editor.chain().focus().insertContent({ type: 'taskNode' }).run()}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-md transition-colors"
                title={t('workdocs.insertTask')}
                aria-label={t('workdocs.insertTask')}
              >
                <PlusSquare className="w-4 h-4 text-brand" />
                {t('workdocs.addInteractiveTask')}
              </button>
            </div>
          )}

          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Global CSS for cursor styling */}
      <style dangerouslySetInnerHTML={{__html: `
        .collaboration-cursor__caret {
          border-left: 1px solid #0D0D0D;
          border-right: 1px solid #0D0D0D;
          margin-left: -1px;
          margin-right: -1px;
          pointer-events: none;
          position: relative;
          word-break: normal;
        }

        .collaboration-cursor__label {
          border-radius: 3px 3px 3px 0;
          color: #0D0D0D;
          font-size: 12px;
          font-style: normal;
          font-weight: 600;
          left: -1px;
          line-height: normal;
          padding: 0.1rem 0.3rem;
          position: absolute;
          top: -1.4em;
          user-select: none;
          white-space: nowrap;
        }
      `}} />
    </div>
  );
}
