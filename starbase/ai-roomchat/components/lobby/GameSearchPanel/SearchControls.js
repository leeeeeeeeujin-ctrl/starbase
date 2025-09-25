import React from 'react'
import { styles } from './styles'

export default function SearchControls({ query, onQueryChange, sort, onSortChange, sortOptions }) {
  return (
    <div style={styles.searchInputs}>
      <input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="게임 이름 또는 설명 검색"
        inputMode="search"
        style={styles.searchInput}
      />
      <select value={sort} onChange={(event) => onSortChange(event.target.value)} style={styles.sortSelect}>
        {sortOptions.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
//
