import { Artwork } from '@/components/ui/Artwork'
import { Icon } from '@/components/ui/Icon'
import { Tooltip } from '@/components/ui/Tooltip'
import { SearchField } from './SearchField'
import { WindowControls } from './WindowControls'
import styles from './TopBar.module.css'

type Props = {
  showWindowControls: boolean
  compactSearch?: boolean
}

/**
 * Top bar of the content panel: the reference puts the search field here with a
 * Ctrl K hint, then the notification bell and the profile avatar. When the queue
 * panel is collapsed the window controls move here so they are never lost.
 */
export function TopBar({ showWindowControls, compactSearch = false }: Props) {
  return (
    <header className={styles.topbar} data-drag-region>
      <SearchField compact={compactSearch} />
      <div className={styles.spacer} data-drag-region />
      <div className={styles.actions} data-no-drag>
        <Tooltip label="Notifications" side="bottom">
          <button type="button" className={styles.iconAction} aria-label="Notifications">
            <Icon name="bell" size={17} />
            <span className={styles.dot} aria-hidden />
          </button>
        </Tooltip>
        <Tooltip label="Crest — your profile" side="bottom">
          <button type="button" className={styles.avatar} aria-label="Your profile">
            <Artwork
              source={{ kind: 'generated', seed: 'crest-profile' }}
              seed="crest-profile"
              alt="Your profile"
              size={26}
              radius="circle"
            />
          </button>
        </Tooltip>
        {showWindowControls ? <WindowControls className={styles.windowControls} /> : null}
      </div>
    </header>
  )
}
