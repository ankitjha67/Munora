import type { Transaction } from '../lib/types'
import { Modal } from './ui'
import { TxTable } from './TxTable'
import { fmtMoney } from '../lib/format'

export function TxListModal({ title, txs, onClose }: { title: string; txs: Transaction[]; onClose: () => void }) {
  const total = txs.reduce((a, t) => a + t.amount, 0)
  return (
    <Modal title={title} onClose={onClose} actions={<span className="muted small num">{txs.length} transactions · {fmtMoney(total)}</span>}>
      <TxTable txs={txs} showHead={false} />
    </Modal>
  )
}
