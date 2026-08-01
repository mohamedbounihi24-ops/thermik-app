import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'

// ---- Types ----
export type PdfCompany = {
  name: string
  siret: string | null
  email: string | null
  phone: string | null
  address: string | null
  logo_url: string | null
}

export type PdfClient = {
  name: string
  address?: string | null
}

export type PdfDevisLine = {
  description: string
  quantite: number
  unite: string
  prix_unitaire: number
  montant_ligne: number
}

export type PdfDevis = {
  numero: string
  created_at: string
}

const COPPER = '#C1613A'
const COPPER_DARK = '#96431F'
const COPPER_SOFT = '#F5E9E0'
const INK = '#18181B'
const MUTED = '#71717A'
const LINE = '#E4E4E7'

// Formatage manuel des nombres : toLocaleString('fr-FR') insère une
// espace insécable fine (U+202F) comme séparateur de milliers, un
// caractère que la police Helvetica embarquée dans le PDF n'arrive pas
// à afficher correctement (d'où le bug "2/800" au lieu de "2 800").
// On force une espace normale à la place.
function formatNumber(n: number): string {
  const [intPart, decPart] = n.toFixed(2).split('.')
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${withSpaces},${decPart}`
}
const eur = (n: number) => `${formatNumber(n)} €`

const dateFr = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })

const styles = StyleSheet.create({
  page: {
    padding: 44,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: INK,
  },
  // --- En-tête ---
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  logo: {
    width: 40,
    height: 40,
    objectFit: 'contain',
    marginBottom: 8,
  },
  companyName: {
    fontSize: 12,
    fontWeight: 700,
    color: INK,
  },
  companyLine: {
    fontSize: 8.5,
    color: MUTED,
    marginTop: 2,
    lineHeight: 1.5,
  },
  docTitleBlock: {
    alignItems: 'flex-end',
  },
  docTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: COPPER_DARK,
    letterSpacing: 2,
  },
  docNumero: {
    fontSize: 9,
    color: MUTED,
    marginTop: 6,
  },
  docDate: {
    fontSize: 8.5,
    color: MUTED,
    marginTop: 1,
  },
  hr: {
    borderBottomWidth: 2,
    borderBottomColor: COPPER,
    marginBottom: 22,
  },
  // --- Client ---
  clientSection: {
    marginBottom: 26,
  },
  label: {
    fontSize: 7.5,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: COPPER_DARK,
    marginBottom: 5,
  },
  clientName: {
    fontSize: 11,
    fontWeight: 700,
    color: INK,
  },
  clientAddress: {
    fontSize: 9,
    color: MUTED,
    marginTop: 2,
  },
  // --- Table ---
  table: {
    marginBottom: 20,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: COPPER,
    paddingBottom: 7,
    marginBottom: 2,
  },
  tableHeaderCell: {
    fontSize: 7.5,
    fontWeight: 700,
    color: COPPER_DARK,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  tableRowAlt: {
    backgroundColor: '#FBF7F3',
  },
  cellDesc: { width: '46%', fontSize: 9.5 },
  cellQty: { width: '12%', textAlign: 'right', fontSize: 9.5, color: MUTED },
  cellUnit: { width: '14%', textAlign: 'center', fontSize: 9.5, color: MUTED },
  cellPrice: { width: '14%', textAlign: 'right', fontSize: 9.5, color: MUTED },
  cellAmount: { width: '14%', textAlign: 'right', fontSize: 9.5, color: INK, fontWeight: 700 },
  // --- Totaux ---
  totalsWrap: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  totalsCard: {
    width: 210,
    borderRadius: 6,
    backgroundColor: COPPER_SOFT,
    padding: 12,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  totalsLabel: {
    fontSize: 9,
    color: COPPER_DARK,
  },
  totalsValue: {
    fontSize: 9,
    color: INK,
  },
  totalsRowFinal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COPPER,
  },
  totalsFinalLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: COPPER_DARK,
  },
  totalsFinalValue: {
    fontSize: 14,
    fontWeight: 700,
    color: COPPER_DARK,
  },
  // --- Signatures ---
  signatureBlock: {
    marginTop: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBox: {
    width: '46%',
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    height: 56,
    marginBottom: 6,
  },
  signatureLabel: {
    fontSize: 7.5,
    textTransform: 'uppercase',
    color: MUTED,
    letterSpacing: 0.6,
  },
  // --- Footer ---
  footer: {
    position: 'absolute',
    bottom: 32,
    left: 44,
    right: 44,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 7,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 1.5,
  },
})

export function DevisPdfDocument({
  company,
  client,
  devis,
  lines,
  tvaRate = 20,
}: {
  company: PdfCompany
  client: PdfClient
  devis: PdfDevis
  lines: PdfDevisLine[]
  tvaRate?: number
}) {
  const totalHt = lines.reduce((sum, l) => sum + l.montant_ligne, 0)
  const totalTva = totalHt * (tvaRate / 100)
  const totalTtc = totalHt + totalTva

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* En-tête */}
        <View style={styles.headerRow}>
          <View>
            {company.logo_url && <Image src={company.logo_url} style={styles.logo} />}
            <Text style={styles.companyName}>{company.name}</Text>
            <Text style={styles.companyLine}>
              {company.address ?? ''}
              {'\n'}
              {[company.email, company.phone].filter(Boolean).join(' · ')}
              {company.siret ? `\nSIRET ${company.siret}` : ''}
            </Text>
          </View>
          <View style={styles.docTitleBlock}>
            <Text style={styles.docTitle}>DEVIS</Text>
            <Text style={styles.docNumero}>{devis.numero}</Text>
            <Text style={styles.docDate}>{dateFr(devis.created_at)}</Text>
          </View>
        </View>

        <View style={styles.hr} />

        {/* Client */}
        <View style={styles.clientSection}>
          <Text style={styles.label}>Devis établi pour</Text>
          <Text style={styles.clientName}>{client.name}</Text>
          {client.address && <Text style={styles.clientAddress}>{client.address}</Text>}
        </View>

        {/* Table des lignes */}
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderCell, styles.cellDesc]}>Description</Text>
            <Text style={[styles.tableHeaderCell, styles.cellQty]}>Qté</Text>
            <Text style={[styles.tableHeaderCell, styles.cellUnit]}>Unité</Text>
            <Text style={[styles.tableHeaderCell, styles.cellPrice]}>Prix unit.</Text>
            <Text style={[styles.tableHeaderCell, styles.cellAmount]}>Montant</Text>
          </View>
          {lines.map((line, i) => (
            <View key={i} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
              <Text style={styles.cellDesc}>{line.description}</Text>
              <Text style={styles.cellQty}>{line.quantite}</Text>
              <Text style={styles.cellUnit}>{line.unite}</Text>
              <Text style={styles.cellPrice}>{eur(line.prix_unitaire)}</Text>
              <Text style={styles.cellAmount}>{eur(line.montant_ligne)}</Text>
            </View>
          ))}
        </View>

        {/* Totaux */}
        <View style={styles.totalsWrap}>
          <View style={styles.totalsCard}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Total HT</Text>
              <Text style={styles.totalsValue}>{eur(totalHt)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>TVA ({tvaRate}%)</Text>
              <Text style={styles.totalsValue}>{eur(totalTva)}</Text>
            </View>
            <View style={styles.totalsRowFinal}>
              <Text style={styles.totalsFinalLabel}>Total TTC</Text>
              <Text style={styles.totalsFinalValue}>{eur(totalTtc)}</Text>
            </View>
          </View>
        </View>

        {/* Signature — champs volontairement vides, à signer après impression ou envoi */}
        <View style={styles.signatureBlock}>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Cachet entreprise</Text>
          </View>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Bon pour accord — date et signature du client</Text>
          </View>
        </View>

        {/* Pied de page légal */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Devis valable 30 jours à compter de sa date d'émission. {company.name}
            {company.siret ? ` — SIRET ${company.siret}` : ''}
            {company.address ? ` — ${company.address}` : ''}
          </Text>
        </View>
      </Page>
    </Document>
  )
}