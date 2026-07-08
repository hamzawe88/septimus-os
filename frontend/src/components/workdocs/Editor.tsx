import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { Loader2, PlusSquare } from 'lucide-react';
import { TaskNode } from './TaskNode';

interface EditorProps {
  documentId: string;
  projectId: string;
  templateType?: string;
}

// Generate random color for cursor
const colors = ['#958DF1', '#F98181', '#FBCE76', '#8CE99A', '#74C0FC', '#B197FC'];
const getRandomColor = () => colors[Math.floor(Math.random() * colors.length)];

export default function WorkDocsEditor({ documentId, projectId, templateType = 'empty' }: EditorProps) {
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  
  // Memoize ydoc so it survives React StrictMode remounts
  const [ydoc] = useState(() => new Y.Doc());
  
  // Memoize userInfo to prevent Tiptap unecessary re-renders
  const [userInfo] = useState(() => ({
    name: 'User ' + Math.floor(Math.random() * 1000),
    color: getRandomColor(),
  }));
  
  

  useEffect(() => {
    const hpProvider = new HocuspocusProvider({
      url: 'ws://localhost:1234',
      name: documentId,
      document: ydoc,
    });
    
    setTimeout(() => setProvider(hpProvider), 0);

    return () => {
      hpProvider.destroy();
    };
  }, [documentId, ydoc]);

  if (!provider || !ydoc || !userInfo) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-[#f8fafc]">
        <div className="flex items-center gap-3 text-slate-500">
          <Loader2 className="animate-spin w-5 h-5" />
          <span>Connecting to WorkDocs sync server...</span>
        </div>
      </div>
    );
  }

  return <WorkDocsEditorCore projectId={projectId} provider={provider} ydoc={ydoc} templateType={templateType} />;
}

function WorkDocsEditorCore({ projectId, provider, ydoc, templateType }: { projectId: string, provider: HocuspocusProvider, ydoc: Y.Doc, templateType: string }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // @ts-expect-error Tiptap types mismatch
        history: false,
      }),
      Collaboration.configure({
        document: ydoc,
      }),
      // CollaborationCursor.configure({
      //   provider: provider,
      //   user: userInfo,
      // }),
      TaskNode.configure({
        projectId: projectId,
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[500px] p-8 bg-white shadow-sm border border-slate-200 rounded-lg',
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
            <h2>وثيقة متطلبات المنتج (PRD) 🚀</h2>
            <h3>الهدف (Goal)</h3>
            <p>وصف مختصر لهدف المنتج وما المشكلة التي يحلها...</p>
            <h3>قصص المستخدم (User Stories)</h3>
            <ul>
              <li>كمستخدم، أريد أن...</li>
            </ul>
            <h3>المهام المقترحة</h3>
            <p>أضف مهامك هنا (اكتب /task أو استخدم الزر):</p>
            <p></p>
          `;
        } else if (templateType === 'meeting') {
          content = `
            <h2>ملاحظات الاجتماع 🤝</h2>
            <h3>التاريخ والحضور</h3>
            <ul>
              <li>التاريخ: </li>
              <li>الحضور: </li>
            </ul>
            <h3>الأجندة</h3>
            <ol>
              <li>نقطة 1</li>
            </ol>
            <h3>نقاط العمل (Action Items)</h3>
            <p>المهام الناتجة عن الاجتماع:</p>
            <p></p>
          `;
        } else if (templateType === 'tech_spec') {
          content = `
            <h2>وثيقة تقنية (Technical Spec) 💻</h2>
            <h3>المقدمة</h3>
            <p>وصف المعمارية والنظام...</p>
            <h3>مخطط قواعد البيانات</h3>
            <p>...</p>
            <h3>مسارات API</h3>
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
  }, [editor, provider, templateType]);

  if (!editor) {
    return null;
  }

  return (
    <div className="relative h-full flex flex-col w-full">
      {/* Editor Content Area */}
      <div className="flex-1 overflow-y-auto bg-[#f8fafc] p-8 pt-4">
        <div className="max-w-4xl mx-auto relative">
          
          {editor && (
            <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md shadow-sm border border-slate-200 rounded-lg p-2 mb-4 flex gap-2">
              <button
                onClick={() => editor.chain().focus().insertContent({ type: 'taskNode' }).run()}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                title="إدراج مهمة تفاعلية"
              >
                <PlusSquare className="w-4 h-4 text-brand" />
                إضافة مهمة تفاعلية
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
