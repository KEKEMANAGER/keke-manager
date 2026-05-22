import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING } from '../constants/theme';
import { slugFromInternalMarkdownLink } from '../lib/legalDocs';

type Block =
  | { type: 'h1' | 'h2' | 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'hr' }
  | { type: 'ul'; items: string[] };

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let listItems: string[] | null = null;

  const flushList = () => {
    if (listItems && listItems.length > 0) {
      blocks.push({ type: 'ul', items: listItems });
    }
    listItems = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    if (trimmed === '---') {
      flushList();
      blocks.push({ type: 'hr' });
      continue;
    }

    if (trimmed.startsWith('# ')) {
      flushList();
      blocks.push({ type: 'h1', text: stripInlineMarkdown(trimmed.slice(2)) });
      continue;
    }
    if (trimmed.startsWith('## ')) {
      flushList();
      blocks.push({ type: 'h2', text: stripInlineMarkdown(trimmed.slice(3)) });
      continue;
    }
    if (trimmed.startsWith('### ')) {
      flushList();
      blocks.push({ type: 'h3', text: stripInlineMarkdown(trimmed.slice(4)) });
      continue;
    }

    if (trimmed.startsWith('- ')) {
      if (!listItems) listItems = [];
      listItems.push(stripInlineMarkdown(trimmed.slice(2)));
      continue;
    }

    if (trimmed.startsWith('|')) {
      flushList();
      blocks.push({ type: 'p', text: stripInlineMarkdown(trimmed) });
      continue;
    }

    flushList();
    blocks.push({ type: 'p', text: stripInlineMarkdown(trimmed) });
  }

  flushList();
  return blocks;
}

function RichLine({ text, onInternalLink }: { text: string; onInternalLink: (slug: string) => void }) {
  const parts = useMemo(() => {
    const re = /\[([^\]]+)\]\(([^)]+)\)/g;
    const out: { kind: 'text' | 'link'; value: string; href?: string }[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) {
        out.push({ kind: 'text', value: text.slice(last, m.index) });
      }
      out.push({ kind: 'link', value: m[1], href: m[2] });
      last = m.index + m[0].length;
    }
    if (last < text.length) {
      out.push({ kind: 'text', value: text.slice(last) });
    }
    return out.length ? out : [{ kind: 'text' as const, value: text }];
  }, [text]);

  return (
    <Text style={styles.paragraph}>
      {parts.map((part, i) => {
        if (part.kind === 'text') {
          const chunks = part.value.split(/(\*\*[^*]+\*\*)/g);
          return chunks.map((chunk, j) => {
            const bold = /^\*\*([^*]+)\*\*$/.exec(chunk);
            if (bold) {
              return (
                <Text key={`${i}-${j}`} style={styles.bold}>
                  {bold[1]}
                </Text>
              );
            }
            return <Text key={`${i}-${j}`}>{chunk}</Text>;
          });
        }
        const href = part.href ?? '';
        const internal = slugFromInternalMarkdownLink(href);
        if (internal) {
          return (
            <Text
              key={`${i}-link`}
              style={styles.link}
              onPress={() => onInternalLink(internal)}
            >
              {part.value}
            </Text>
          );
        }
        if (href.startsWith('mailto:')) {
          return (
            <Text
              key={`${i}-mail`}
              style={styles.link}
              onPress={() => void Linking.openURL(href)}
            >
              {part.value}
            </Text>
          );
        }
        return <Text key={`${i}-plain`}>{part.value}</Text>;
      })}
    </Text>
  );
}

export function LegalMarkdownView({ markdown }: { markdown: string }) {
  const router = useRouter();
  const blocks = useMemo(() => parseMarkdown(markdown), [markdown]);

  const onInternalLink = (slug: string) => {
    router.push({ pathname: '/legal/[slug]', params: { slug } });
  };

  return (
    <View style={styles.root}>
      {blocks.map((block, index) => {
        if (block.type === 'hr') {
          return <View key={index} style={styles.hr} />;
        }
        if (block.type === 'h1') {
          return (
            <Text key={index} style={styles.h1}>
              {block.text}
            </Text>
          );
        }
        if (block.type === 'h2') {
          return (
            <Text key={index} style={styles.h2}>
              {block.text}
            </Text>
          );
        }
        if (block.type === 'h3') {
          return (
            <Text key={index} style={styles.h3}>
              {block.text}
            </Text>
          );
        }
        if (block.type === 'ul') {
          return (
            <View key={index} style={styles.ul}>
              {block.items.map((item, i) => (
                <View key={i} style={styles.liRow}>
                  <Text style={styles.bullet}>•</Text>
                  <RichLine text={item} onInternalLink={onInternalLink} />
                </View>
              ))}
            </View>
          );
        }
        return (
          <RichLine key={index} text={block.text} onInternalLink={onInternalLink} />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: SPACING.sm,
  },
  h1: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  h2: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: SPACING.md,
  },
  h3: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: SPACING.sm,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.textSecondary,
  },
  bold: {
    fontWeight: '700',
    color: COLORS.text,
  },
  link: {
    color: COLORS.goldDark,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  hr: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.sm,
  },
  ul: {
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  liRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  bullet: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.goldDark,
    marginTop: 1,
  },
});
