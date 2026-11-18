import React, { type ReactNode } from 'react';

const SPEC_CODE_TOKEN =
  '(?:MC\\d{2}|TST\\d+|ORG\\d+(?:-\\d+)?|EMP\\d+|ADM\\d+(?:-[A-Z]?\\d+)?|CAP-ADM\\d+-\\d+|CPT\\d+|EXT(?:-[A-Z]+\\d*(?:-\\d+)?)?\\d*|ABS\\d+|DIS\\d+|BAD\\d+|OBJ\\d+|DOC\\d+|EDI\\d+|RAP\\d+|EXP\\d+|PIL\\d+|MIS\\d+|COM\\d+|PAR\\d+|INT\\d+|REC\\d+|AMB\\d+(?:-\\d+)?|DRO\\d+|JOU\\d+|UTI\\d+|OS\\d+|EX\\d+|NAV\\d+|ACC\\d+|LEAD-TST\\d+|RDV-\\d+|WA-\\d+(?:\\/\\d+)?|ACL-\\d+|API-\\d+|SMS-\\d+|INC-\\d+|G18)';

const PAREN_TECH_RE = new RegExp(
  `\\s*\\((?:[^()]*\\b(?:${SPEC_CODE_TOKEN}|UUID|V1\\.16|v0\\.4|6×44|cnt-\\d+|simulation(?:\\s+locale)?|bac\\s+à\\s+sable|côté\\s+serveur|lecture\\s+seule\\s+V1\\.16|Contrat\\s+passé\\s+fictif|OIDC\\s*\\/\\s*SAML)\\b[^()]*)\\)`,
  'gi'
);

const LEADING_CODE_PREFIX_RE = new RegExp(
  `^(?:${SPEC_CODE_TOKEN}\\s*(?:[\\/•·,&–-]\\s*)?)+(?::\\s*|[•·—-]\\s+)`,
  'i'
);

const TRAILING_CODE_SUFFIX_RE = new RegExp(
  `\\s*(?:[·•—-]\\s*(?:État\\s*:?\\s*)?)(?:${SPEC_CODE_TOKEN})(?:\\s*\\/\\s*${SPEC_CODE_TOKEN})*\\b`,
  'gi'
);

const STANDALONE_CODE_RE = new RegExp(`\\b${SPEC_CODE_TOKEN}\\b`, 'g');

const PURE_CODE_BADGE_RE = new RegExp(
  `^(?:${SPEC_CODE_TOKEN}|V1\\.16|UUID|6×44|[\\s•·/–,:—-]|absent\\s*≠\\s*0\\s*€|Module\\s+G18\\s+isolé)+$`,
  'i'
);

const SECTION_AUDIT_HEADER_RE = /^MC\d{2}\s*•/;

const AUDIT_NOTE_PREFIX_RE =
  /^(?:Note V1\.16|Note AMB\d+|État exact relevé sur|État observé en V1\.16|Échantillon V1\.16|5 modèles relevés V1\.16|Statut V1\.16|Entrée non exposée dans le menu administrateur|Conserve ORG02 uniquement en archive|Chaque carte « Administrateur système » de l’écran ORG04)/i;

const AUDIT_CARD_RE =
  /(?:Note AMB14-06|Décision périmètre ORG02|Postes PAR17 à libellé identique|Comparatif des 7 écarts Beynost vs Carré de Soie|7 Groupes de règles du rapport \(Carré de Soie\) vs Visibilité Beynost|Entrée non exposée dans le menu administrateur Beynost)/i;

const SIMULATION_TOGGLE_RE = /^Simuler\s+(?:«|RTT)/i;

const BLOCK_TAGS = new Set([
  'div',
  'section',
  'article',
  'main',
  'aside',
  'header',
  'footer',
  'nav',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'ul',
  'ol',
  'li',
  'form',
  'details',
  'h1',
  'h2',
  'h3',
  'h4',
]);

export function cleanBusinessText(input: string): string {
  if (!input || !input.trim()) return input;

  const hasLeadingSpace = /^\s/.test(input);
  const hasTrailingSpace = /\s$/.test(input);

  let s = input;

  s = s
    .replace(/CDI\s*\(Terminé\s*[—-]\s*Contrat passé fictif\)/gi, 'CDI (Terminé)')
    .replace(/Droit\s+ORG04-\d+\s+requis(?:\s+côté\s+serveur)?/gi, 'Modification réservée aux responsables')
    .replace(/Champs salariaux\s*\/\s*IBAN\s*\/\s*NIR non transmis par l[’']API(?:\s*\(TST\d+\))?/gi, 'Données salariales et bancaires masquées')
    .replace(/[Nn]on transmis par l[’']API/g, 'Masqué')
    .replace(/Masquage serveur IBAN\s*\/\s*NIR\s*\/\s*Salaires[^\n]*/gi, '')
    .replace(/sous contrôle serveur\s+ORG04-\d+/gi, 'sécurisé')
    .replace(/sans\s+ORG04-\d+/gi, 'selon vos droits')
    .replace(/via\s+ORG04-\d+/gi, '')
    .replace(/si droit\s+ORG04-\d+\s+absent/gi, '')
    .replace(/modifiable\s+ORG04-\d+/gi, 'modifiable')
    .replace(/ORG04-\d+\s+actif/gi, 'Autorisé')
    .replace(/Ligne officielle\s+ADM14-\d+/gi, 'Rubrique')
    .replace(/Postes\s+PAR17\s+à\s+libellé\s+identique/gi, 'Postes à libellé identique')
    .replace(/Règles de base,\s*Besoins\s*&\s*UUID/gi, 'Règles de base & Besoins')
    .replace(/Compteurs,\s*CP\s*&\s*42\s*Annualisation/gi, 'Compteurs, CP & Annualisation')
    .replace(/66\s+Motifs\s+d[’']absence/gi, 'Motifs d’absence')
    .replace(/19\s+Alertes/g, 'Alertes')
    .replace(/14\s+Contraintes\s+Smart\s+Planner/g, 'Contraintes de planification')
    .replace(/6\s+Profils\s+canoniques/gi, 'Profils')
    .replace(/Paramètres\s+source\s+/gi, 'Paramètres — ')
    .replace(/Source\s+[A-Z0-9-]+\s*•\s*/g, '')
    .replace(/\s*\(\+\d+\s+carte\)/g, '')
    .replace(/Oui\s+\(1\)/g, 'Oui')
    .replace(/Non\s+\(0\)/g, 'Non')
    .replace(/\s*\(verr\.\)/g, '')
    .replace(/Référentiel postes UUID/gi, 'Référentiel des postes')
    .replace(/avec UUID technique unique/gi, '')
    .replace(/identifiant technique unique/gi, 'identifiant unique')
    .replace(/cfitness-fictif\.local/gi, 'cfitness.fr')
    .replace(/\bFICT-/g, 'CF-')
    .replace(/\bSIREN\s+fictif\b/gi, 'SIREN')
    .replace(/\bfictifs?\b/gi, '')
    .replace(/côté serveur(?:\s+et\s+tracées?)?/gi, '')
    .replace(/en bac à sable/gi, '')
    .replace(/\(simulation[^()]*\)/gi, '')
    .replace(/\ben\s+V1\.16\b/gi, '')
    .replace(/\bV1\.16\b/gi, '');

  s = s.replace(PAREN_TECH_RE, '');
  s = s.replace(PAREN_TECH_RE, '');
  s = s.replace(LEADING_CODE_PREFIX_RE, '');
  s = s.replace(TRAILING_CODE_SUFFIX_RE, '');
  s = s.replace(STANDALONE_CODE_RE, '');

  s = s
    .replace(/\(\s*[·•/—,-]*\s*\)/g, '')
    .replace(/\s+[•·—-]\s*$/g, '')
    .replace(/^\s*[•·—-]\s+/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,;:])/g, '$1')
    .replace(/\s+\.(?=\s|$)/g, '.')
    .trim();

  if (!s) return '';
  return `${hasLeadingSpace ? ' ' : ''}${s}${hasTrailingSpace ? ' ' : ''}`;
}

function extractPlainText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractPlainText).join('');
  if (React.isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return extractPlainText(props.children);
  }
  return '';
}

function hasBlockChild(node: ReactNode): boolean {
  if (node === null || node === undefined || typeof node === 'boolean') return false;
  if (Array.isArray(node)) return node.some(hasBlockChild);
  if (React.isValidElement(node)) {
    if (typeof node.type === 'string' && BLOCK_TAGS.has(node.type)) {
      return true;
    }
    const props = node.props as { children?: ReactNode };
    return hasBlockChild(props.children);
  }
  return false;
}

function coalescePrimitiveChildren(children: ReactNode): ReactNode {
  if (!Array.isArray(children)) return children;
  const out: ReactNode[] = [];
  let textBuffer: string | null = null;

  for (const child of children) {
    if (typeof child === 'string' || typeof child === 'number') {
      textBuffer = (textBuffer ?? '') + String(child);
    } else if (child === null || child === undefined || typeof child === 'boolean') {
      // skip empty boolean/null inside primitive runs
      if (textBuffer === null) {
        out.push(child);
      }
    } else {
      if (textBuffer !== null) {
        out.push(textBuffer);
        textBuffer = null;
      }
      out.push(child);
    }
  }
  if (textBuffer !== null) {
    out.push(textBuffer);
  }
  return out.length === 1 ? out[0] : out;
}

export function cleanUiTree(node: ReactNode, isTechnicalMode: boolean): ReactNode {
  if (isTechnicalMode) return node;
  if (node === null || node === undefined || typeof node === 'boolean') return node;

  if (typeof node === 'string') {
    return cleanBusinessText(node);
  }

  if (Array.isArray(node)) {
    const coalesced = coalescePrimitiveChildren(node);
    if (!Array.isArray(coalesced)) {
      return cleanUiTree(coalesced, false);
    }
    return coalesced.map((child, idx) => {
      const cleaned = cleanUiTree(child, false);
      if (React.isValidElement(cleaned) && cleaned.key === null) {
        return React.cloneElement(cleaned, { key: idx });
      }
      return cleaned;
    });
  }

  if (React.isValidElement(node)) {
    const type = node.type;
    const props = node.props as Record<string, unknown> & {
      children?: ReactNode;
      className?: string;
      title?: string;
      placeholder?: string;
    };

    if (typeof type === 'string') {
      const plain = extractPlainText(props.children).trim();

      if (type === 'details' && /Traçabilité|V1\.16/i.test(plain)) {
        return null;
      }

      if ((type === 'label' || type === 'button') && SIMULATION_TOGGLE_RE.test(plain)) {
        return null;
      }

      // Hide self-contained audit note cards (Note AMB14-06, Décision périmètre ORG02, Comparatif 7 écarts, Postes PAR17...)
      if (
        type === 'div' &&
        typeof props.className === 'string' &&
        /\bcf-card(?:-secondary)?\b/.test(props.className) &&
        plain.length < 700 &&
        AUDIT_CARD_RE.test(plain)
      ) {
        return null;
      }

      if ((type === 'div' || type === 'span' || type === 'p') && !hasBlockChild(props.children)) {
        if (
          plain &&
          plain.length < 260 &&
          (SECTION_AUDIT_HEADER_RE.test(plain) ||
            PURE_CODE_BADGE_RE.test(plain) ||
            /^UUID\s*:/i.test(plain) ||
            AUDIT_NOTE_PREFIX_RE.test(plain))
        ) {
          return null;
        }
      }
    }

    const nextProps: Record<string, unknown> = {};
    let changed = false;

    if (typeof props.title === 'string') {
      const ct = cleanBusinessText(props.title);
      if (ct !== props.title) {
        nextProps.title = ct;
        changed = true;
      }
    }

    if (typeof props.placeholder === 'string') {
      const cp = cleanBusinessText(props.placeholder);
      if (cp !== props.placeholder) {
        nextProps.placeholder = cp;
        changed = true;
      }
    }

    if ('children' in props && props.children !== undefined) {
      const coalescedChildren = coalescePrimitiveChildren(props.children);
      const cleanedChildren = cleanUiTree(coalescedChildren, false);
      if (cleanedChildren !== props.children) {
        nextProps.children = cleanedChildren;
        changed = true;
      }
    }

    return changed ? React.cloneElement(node, nextProps) : node;
  }

  return node;
}
